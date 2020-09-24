const { expectRevert, time } = require('@openzeppelin/test-helpers');
const ethers = require('ethers');
const JokerToken = artifacts.require('JokerToken');
const LordJoker = artifacts.require('LordJoker');
const Timelock = artifacts.require('Timelock');
const GovernorAlpha = artifacts.require('GovernorAlpha');
const MockERC20 = artifacts.require('MockERC20');

function encodeParameters(types, values) {
  const abi = new ethers.utils.AbiCoder();
  return abi.encode(types, values);
}

contract('Governor', ([alice, minter, dev, bob]) => {
  it('should work', async () => {
    this.joker = await JokerToken.new({ from: alice });
    await this.joker.delegate(dev, { from: dev });
    this.timelock = await Timelock.new(alice, time.duration.days(2), { from: alice });
    this.lordJoker = await LordJoker.new(this.joker.address, dev, this.timelock.address, 0, { from: alice });
    await this.joker.transferOwnership(this.lordJoker.address, { from: alice });
    this.lp = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minter });
    this.lp2 = await MockERC20.new('LPToken2', 'LP2', '10000000000', { from: minter });
    await this.lordJoker.add('100', this.lp.address, false, false, { from: alice });
    await this.lp.transfer(bob, '1000', { from: minter });
    await this.lp.approve(this.lordJoker.address, '1000', { from: bob });
    await this.lp.approve(this.lordJoker.address, '1000', { from: minter });
    await this.lordJoker.deposit(bob, 0, '1000', { from: bob });
    await this.lordJoker.deposit(minter, 0, '1000', { from: minter });
    assert.equal((await this.joker.totalSupply()).valueOf(), 80 * 1e18);
    assert.equal((await this.joker.balanceOf(dev)).valueOf(), 8 * 1e18);
    assert.equal((await this.joker.balanceOf(this.timelock.address)).valueOf(), 8 * 1e18);
    assert.equal((await this.joker.balanceOf(this.lordJoker.address)).valueOf(), 64 * 1e18);
    this.gov = await GovernorAlpha.new(this.timelock.address, this.joker.address, alice, { from: alice });
    await this.timelock.setPendingAdmin(this.gov.address, { from: alice });
    await this.gov.__acceptAdmin({ from: alice });
    await this.lordJoker.transferOwnership(this.timelock.address, { from: alice });
    await expectRevert(
      this.lordJoker.add('100', this.lp2.address, true, false, { from: alice }),
      'Ownable: caller is not the owner',
    );
    await expectRevert(
      this.gov.propose(
        [this.lordJoker.address], ['0'], ['add(uint256,address,bool,bool)'],
        [encodeParameters(['uint256', 'address', 'bool', 'bool'], ['100', this.lp2.address, true, false])],
        'Add LP2',
        { from: alice },
      ),
      'GovernorAlpha::propose: proposer votes below proposal threshold',
    );
    await this.gov.propose(
      [this.lordJoker.address], ['0'], ['add(uint256,address,bool,bool)'],
      [encodeParameters(['uint256', 'address', 'bool', 'bool'], ['100', this.lp2.address, true, false])],
      'Add LP2',
      { from: dev },
    );
    await time.advanceBlock();
    await this.gov.castVote('1', true, { from: dev });
    await expectRevert(this.gov.queue('1'), "GovernorAlpha::queue: proposal can only be queued if it is succeeded");
    let votingPeriod = 17280;
    console.log("Advancing %s blocks. Will take a while...", votingPeriod);
    for (let i = 0; i < votingPeriod; ++i) {
      await time.advanceBlock();
    }
    await this.gov.queue('1');
    await expectRevert(this.gov.execute('1'), "Timelock::executeTransaction: Transaction hasn't surpassed time lock.");
    await time.increase(time.duration.days(3));
    await this.gov.execute('1');
    assert.equal((await this.lordJoker.poolInfo('1')).valueOf().allocPoint, '100');
    assert.equal((await this.lordJoker.totalAllocPoint()).valueOf(), '200');
    assert.equal((await this.lordJoker.poolLength()).valueOf(), '2');
  });
});