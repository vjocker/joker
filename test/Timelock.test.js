const { ZERO_ADDRESS } = require('@openzeppelin/test-helpers/src/constants');
const { expectRevert, time } = require('@openzeppelin/test-helpers');
const ethers = require('ethers');
const JokerToken = artifacts.require('JokerToken');
const LordJoker = artifacts.require('LordJoker');
const MockERC20 = artifacts.require('MockERC20');
const Timelock = artifacts.require('Timelock');
const GovernorAlpha = artifacts.require('GovernorAlpha');


function encodeParameters(types, values) {
  const abi = new ethers.utils.AbiCoder();
  return abi.encode(types, values);
}

contract('Timelock', ([alice, bob, carol, dev, minter]) => {
  beforeEach(async () => {
    this.joker = await JokerToken.new({ from: alice });
    this.timelock = await Timelock.new(bob, '172800', { from: alice });
  });

  describe('Constructor check', () => {
    it('should have correct init status', async () => {
      const admin = await this.timelock.admin();
      assert.equal(admin.valueOf(), bob);
      const pendingAdmin = await this.timelock.pendingAdmin();
      assert.equal(pendingAdmin.valueOf(), ZERO_ADDRESS);
      const delay = await this.timelock.delay();
      assert.equal(delay.valueOf(), '172800');
      const admin_initialized = await this.timelock.admin_initialized();
      assert.equal(admin_initialized.valueOf(), false);
    });
  });

  describe('Authority check', () => {
    it('should not allow non-self to setDelay', async () => {
      await expectRevert(
        this.timelock.setDelay('172801', { from: alice }),
        'Timelock::setDelay: Call must come from Timelock.',
      );
      await expectRevert(
        this.timelock.setDelay('172801', { from: bob }),
        'Timelock::setDelay: Call must come from Timelock.',
      );
    });

    it('should not allow non-admin to setPendingAdmin at first call', async () => {
      await expectRevert(
        this.timelock.setPendingAdmin(carol, { from: alice }),
        'Timelock::setPendingAdmin: First call must come from admin.',
      );
      await expectRevert(
        this.timelock.setPendingAdmin(carol, { from: carol }),
        'Timelock::setPendingAdmin: First call must come from admin.',
      );
    });

    it('should allow admin to setPendingAdmin at first call', async () => {
      await this.timelock.setPendingAdmin(carol, { from: bob });
      const pendingAdmin = await this.timelock.pendingAdmin();
      assert.equal(pendingAdmin.valueOf(), carol);
    });

    it('should not allow non-self to setPendingAdmin after first call', async () => {
      await this.timelock.setPendingAdmin(carol, { from: bob });
      await expectRevert(
        this.timelock.setPendingAdmin(alice, { from: bob }),
        'Timelock::setPendingAdmin: Call must come from Timelock.',
      );
      await expectRevert(
        this.timelock.setPendingAdmin(alice, { from: carol }),
        'Timelock::setPendingAdmin: Call must come from Timelock.',
      );
      await expectRevert(
        this.timelock.setPendingAdmin(alice, { from: alice }),
        'Timelock::setPendingAdmin: Call must come from Timelock.',
      );
    });

    it('should not allow non-pendingAdmin to acceptAdmin', async () => {
      await expectRevert(
        this.timelock.acceptAdmin({ from: alice }),
        'Timelock::acceptAdmin: Call must come from pendingAdmin.',
      );
      await expectRevert(
        this.timelock.acceptAdmin({ from: bob }),
        'Timelock::acceptAdmin: Call must come from pendingAdmin.',
      );
    });

    it('should allow pendingAdmin(user) to acceptAdmin', async () => {
      await this.timelock.setPendingAdmin(carol, { from: bob });
      await this.timelock.acceptAdmin({ from: carol });
      const admin = await this.timelock.admin();
      assert.equal(admin.valueOf(), carol);
      const pendingAdmin = await this.timelock.pendingAdmin();
      assert.equal(pendingAdmin.valueOf(), ZERO_ADDRESS);
    });

    it('should allow pendingAdmin(contract) to acceptAdmin', async () => {
      this.governor = await GovernorAlpha.new(this.timelock.address, this.joker.address, alice, { from: alice });
      await this.timelock.setPendingAdmin(this.governor.address, { from: bob });
      await this.governor.__acceptAdmin({ from: alice });
      const admin = await this.timelock.admin();
      assert.equal(admin.valueOf(), this.governor.address);
      const pendingAdmin = await this.timelock.pendingAdmin();
      assert.equal(pendingAdmin.valueOf(), ZERO_ADDRESS);
    });

    it('should not allow non-admin to queueTransaction', async () => {
      await this.joker.transferOwnership(this.timelock.address, { from: alice });
      await expectRevert(
        this.timelock.queueTransaction(
          this.joker.address, '0', 'transferOwnership(address)',
          encodeParameters(['address'], [carol]),
          (await time.latest()).add(time.duration.days(3)),
          { from: alice },
        ),
        'Timelock::queueTransaction: Call must come from admin.',
      );
    });
  });

  describe('Transaction check', () => {
    it('should do the timelock thing', async () => {
      await this.joker.transferOwnership(this.timelock.address, { from: alice });
      const eta = (await time.latest()).add(time.duration.days(3));
      await this.timelock.queueTransaction(
        this.joker.address, '0', 'transferOwnership(address)',
        encodeParameters(['address'], [carol]), eta, { from: bob },
      );
      await time.increase(time.duration.days(1));
      await expectRevert(
        this.timelock.executeTransaction(
          this.joker.address, '0', 'transferOwnership(address)',
          encodeParameters(['address'], [carol]), eta, { from: bob },
        ),
        "Timelock::executeTransaction: Transaction hasn't surpassed time lock.",
      );
      await time.increase(time.duration.days(3));
      await this.timelock.executeTransaction(
        this.joker.address, '0', 'transferOwnership(address)',
        encodeParameters(['address'], [carol]), eta, { from: bob },
      );
      assert.equal((await this.joker.owner()).valueOf(), carol);
    });

    it('should also work with LordJoker', async () => {
      this.lp1 = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minter });
      this.lp2 = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minter });
      this.lordJoker = await LordJoker.new(this.joker.address, dev, this.timelock.address, 0, { from: alice });
      await this.joker.transferOwnership(this.lordJoker.address, { from: alice });
      await this.lordJoker.add('100', this.lp1.address, false ,false, { from: alice });
      await this.lordJoker.transferOwnership(this.timelock.address, { from: alice });
      const eta = (await time.latest()).add(time.duration.days(3));
      await this.timelock.queueTransaction(
        this.lordJoker.address, '0', 'set(uint256,uint256,bool)',
        encodeParameters(['uint256', 'uint256', 'bool'], ['0', '200', false]), eta, { from: bob },
      );
      await this.timelock.queueTransaction(
        this.lordJoker.address, '0', 'add(uint256,address,bool,bool)',
        encodeParameters(['uint256', 'address', 'bool', 'bool'], ['100', this.lp2.address, false, false]), eta, { from: bob },
      );
      await time.increase(time.duration.days(4));
      await this.timelock.executeTransaction(
        this.lordJoker.address, '0', 'set(uint256,uint256,bool)',
        encodeParameters(['uint256', 'uint256', 'bool'], ['0', '200', false]), eta, { from: bob },
      );
      await this.timelock.executeTransaction(
        this.lordJoker.address, '0', 'add(uint256,address,bool,bool)',
        encodeParameters(['uint256', 'address', 'bool', 'bool'], ['100', this.lp2.address, false, false]), eta, { from: bob },
      );
      assert.equal((await this.lordJoker.poolInfo('0')).valueOf().allocPoint, '200');
      assert.equal((await this.lordJoker.poolInfo('1')).valueOf().allocPoint, '100');
      assert.equal((await this.lordJoker.totalAllocPoint()).valueOf(), '300');
      assert.equal((await this.lordJoker.poolLength()).valueOf(), '2');
    });
  });
});