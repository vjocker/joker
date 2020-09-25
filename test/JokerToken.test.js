const { ZERO_ADDRESS } = require('@openzeppelin/test-helpers/src/constants');
const { expectRevert, time } = require('@openzeppelin/test-helpers');
const JokerToken = artifacts.require('JokerToken');

contract('JokerToken', ([alice, bob, carol, leo]) => {
  
  describe('JOKER token', () => {
    beforeEach(async () => {
      this.joker = await JokerToken.new({ from: alice });
    });

    it('should have correct name and symbol and decimal', async () => {
      const name = await this.joker.name();
      const symbol = await this.joker.symbol();
      const decimals = await this.joker.decimals();
      assert.equal(name.valueOf(), 'JokerToken');
      assert.equal(symbol.valueOf(), 'JOKER');
      assert.equal(decimals.valueOf(), '18');
    });

    it('should only allow owner to mint token', async () => {
      await this.joker.mint(alice, '100', { from: alice });
      await this.joker.mint(bob, '1000', { from: alice });
      await expectRevert(
        this.joker.mint(carol, '1000', { from: bob }),
        'Ownable: caller is not the owner',
      );
      const totalSupply = await this.joker.totalSupply();
      const aliceBal = await this.joker.balanceOf(alice);
      const bobBal = await this.joker.balanceOf(bob);
      const carolBal = await this.joker.balanceOf(carol);
      assert.equal(totalSupply.valueOf(), '1100');
      assert.equal(aliceBal.valueOf(), '100');
      assert.equal(bobBal.valueOf(), '1000');
      assert.equal(carolBal.valueOf(), '0');
    });

    it('should supply token transfers properly', async () => {
      await this.joker.mint(alice, '100', { from: alice });
      await this.joker.mint(bob, '1000', { from: alice });
      await this.joker.transfer(carol, '10', { from: alice });
      await this.joker.transfer(carol, '100', { from: bob });
      const totalSupply = await this.joker.totalSupply();
      const aliceBal = await this.joker.balanceOf(alice);
      const bobBal = await this.joker.balanceOf(bob);
      const carolBal = await this.joker.balanceOf(carol);
      assert.equal(totalSupply.valueOf(), '1100');
      assert.equal(aliceBal.valueOf(), '90');
      assert.equal(bobBal.valueOf(), '900');
      assert.equal(carolBal.valueOf(), '110');
    });

    it('should fail if you try to do bad transfers', async () => {
      await this.joker.mint(alice, '100', { from: alice });
      await expectRevert(
        this.joker.transfer(carol, '110', { from: alice }),
        'ERC20: transfer amount exceeds balance',
      );
      await expectRevert(
        this.joker.transfer(carol, '1', { from: bob }),
        'ERC20: transfer amount exceeds balance',
      );
    });

    it('should fail if you try to approve the same user again', async () => {
      await this.joker.mint(alice, '1000', { from: alice });
      await this.joker.approve(carol, '100', { from: alice });
      const carolAll = await this.joker.allowance(alice, carol);
      assert.equal(carolAll.valueOf(), '100');
      await this.joker.approve(bob, '100', { from: alice });
      const bobAll = await this.joker.allowance(alice, bob);
      assert.equal(bobAll.valueOf(), '100');
      await expectRevert(
        this.joker.approve(carol, '50', { from: alice }),
        'JOKER: use increaseAllowance or decreaseAllowance instead',
      );
      await expectRevert(
        this.joker.approve(carol, '150', { from: alice }),
        'JOKER: use increaseAllowance or decreaseAllowance instead',
      );
      await this.joker.approve(carol, '0', { from: alice });
      const carolAll2 = await this.joker.allowance(alice, carol);
      assert.equal(carolAll2.valueOf(), '0');
    });

    it('should supply token transferFrom properly', async () => {
      await this.joker.mint(alice, '100', { from: alice });
      await this.joker.mint(bob, '1000', { from: alice });
      await this.joker.approve(carol, '200', { from: bob });
      await this.joker.transferFrom(bob, carol, '100', { from: carol });
      await this.joker.transferFrom(bob, leo, '100', { from: carol });
      const totalSupply = await this.joker.totalSupply();
      const aliceBal = await this.joker.balanceOf(alice);
      const bobBal = await this.joker.balanceOf(bob);
      const carolBal = await this.joker.balanceOf(carol);
      const leoBal = await this.joker.balanceOf(leo);
      assert.equal(totalSupply.valueOf(), '1100');
      assert.equal(aliceBal.valueOf(), '100');
      assert.equal(bobBal.valueOf(), '800');
      assert.equal(carolBal.valueOf(), '100');
      assert.equal(leoBal.valueOf(), '100');
    });

    it('should fail if you try to do bad transferFrom', async () => {
      await this.joker.mint(alice, '100', { from: alice });
      await expectRevert(
        this.joker.transferFrom(alice, carol, '110', { from: carol }),
        'ERC20: transfer amount exceeds balance',
      );
      await expectRevert(
        this.joker.transferFrom(alice, carol, '10', { from: bob }),
        'ERC20: transfer amount exceeds allowance',
      );
    });

    it('should not allow non-owner to transferOwnership', async () => {
      await this.joker.transferOwnership(leo, { from: alice });
      await expectRevert(
        this.joker.transferOwnership(carol, { from: alice }),
        'Ownable: caller is not the owner',
      );
      await expectRevert(
        this.joker.transferOwnership(carol, { from: bob }),
        'Ownable: caller is not the owner',
      );
    });
  })

  describe('token governance', () => {
    let height;
    let height2;
    let height3;
    let height4;
    let height5;
    let height6;
    let height7;

    it('should have same votes after mint', async () => {
      this.joker = await JokerToken.new({ from: alice });
      var bobVotes = await this.joker.getCurrentVotes(bob);
      assert.equal(bobVotes.valueOf(), '0');
      await this.joker.mint(bob, '200', { from: alice });
      var bobVotes = await this.joker.getCurrentVotes(bob);
      assert.equal(bobVotes.valueOf(), '0');
    });
    
    it('should delegate correct after bob delegate to carol', async () => {
      await this.joker.mint(carol, '100', { from: alice });
      await this.joker.delegate(carol, { from: bob });
      var bobDel = await this.joker.delegates(bob);
      assert.equal(bobDel.valueOf(), carol);
    });

    it('should fail if you delegate to the same user', async () => {
      await expectRevert(
        this.joker.delegate(carol, { from: bob }),
        'JOKER::delegate: delegatee not change',
      );
    });

    it('should have correct CurrentVotes and numCheckpoints', async () => {
      var carolVotes = await this.joker.getCurrentVotes(carol);
      assert.equal(carolVotes.valueOf(), '200');
      var bobVotes = await this.joker.getCurrentVotes(bob);
      assert.equal(bobVotes.valueOf(), '0');

      var carolCheckpoints = await this.joker.numCheckpoints(carol);
      assert.equal(carolCheckpoints.valueOf(), '1');
      var bobCheckpoints = await this.joker.numCheckpoints(bob);
      assert.equal(bobCheckpoints.valueOf(), '0');
    });

    it('should have correct PriorVotes after advanceBlock', async () => {
      await time.advanceBlock();
      height = await web3.eth.getBlockNumber() - 1;
      var carolPriorlVotes = await this.joker.getPriorVotes(carol, height);
      assert.equal(carolPriorlVotes.valueOf(), '200');
      var bobPriorlVotes = await this.joker.getPriorVotes(bob, height);
      assert.equal(bobPriorlVotes.valueOf(), '0');
    });
    
    it('should delegate correct after carol delegate to alice', async () => {
      await this.joker.delegate(alice, { from: carol });
      var aliceDel = await this.joker.delegates(alice);
      assert.equal(aliceDel.valueOf(), ZERO_ADDRESS);
      var carolDel = await this.joker.delegates(carol);
      assert.equal(carolDel.valueOf(), alice);
      var bobDel = await this.joker.delegates(bob);
      assert.equal(bobDel.valueOf(), carol);
    });

    it('should have correct CurrentVotes and numCheckpoints again', async () => {
      var aliceVotes = await this.joker.getCurrentVotes(alice);
      assert.equal(aliceVotes.valueOf(), '100');
      var carolVotes = await this.joker.getCurrentVotes(carol);
      assert.equal(carolVotes.valueOf(), '200');
      var bobVotes = await this.joker.getCurrentVotes(bob);
      assert.equal(bobVotes.valueOf(), '0');

      var aliceCheckpoints = await this.joker.numCheckpoints(alice);
      assert.equal(aliceCheckpoints.valueOf(), '1');
      var carolCheckpoints = await this.joker.numCheckpoints(carol);
      assert.equal(carolCheckpoints.valueOf(), '1');
      var bobCheckpoints = await this.joker.numCheckpoints(bob);
      assert.equal(bobCheckpoints.valueOf(), '0');
    });

    it('should have correct PriorVotes with height2 and height after advanceBlock', async () => {
      await time.advanceBlock();
      height2 = await web3.eth.getBlockNumber() - 1;
      var alicePriorlVotes = await this.joker.getPriorVotes(alice, height2);
      assert.equal(alicePriorlVotes.valueOf(), '100');
      var carolPriorlVotes = await this.joker.getPriorVotes(carol, height2);
      assert.equal(carolPriorlVotes.valueOf(), '200');
      var bobPriorlVotes = await this.joker.getPriorVotes(bob, height2);
      assert.equal(bobPriorlVotes.valueOf(), '0');

      var alicePriorlVotes = await this.joker.getPriorVotes(alice, height);
      assert.equal(alicePriorlVotes.valueOf(), '0');
      var carolPriorlVotes = await this.joker.getPriorVotes(carol, height);
      assert.equal(carolPriorlVotes.valueOf(), '200');
      var bobPriorlVotes = await this.joker.getPriorVotes(bob, height);
      assert.equal(bobPriorlVotes.valueOf(), '0');
    });

    it('should delegate correct after bob change delegation from carol to alice', async () => {
      await this.joker.delegate(alice, { from: bob });
      var aliceDel = await this.joker.delegates(alice);
      assert.equal(aliceDel.valueOf(), ZERO_ADDRESS);
      var carolDel = await this.joker.delegates(carol);
      assert.equal(carolDel.valueOf(), alice);
      var bobDel = await this.joker.delegates(bob);
      assert.equal(bobDel.valueOf(), alice);
    });
    
    it('should have correct CurrentVotes and numCheckpoints then', async () => {
      var aliceVotes = await this.joker.getCurrentVotes(alice);
      assert.equal(aliceVotes.valueOf(), '300');
      var carolVotes = await this.joker.getCurrentVotes(carol);
      assert.equal(carolVotes.valueOf(), '0');
      var bobVotes = await this.joker.getCurrentVotes(bob);
      assert.equal(bobVotes.valueOf(), '0');

      var aliceCheckpoints = await this.joker.numCheckpoints(alice);
      assert.equal(aliceCheckpoints.valueOf(), '2');
      var carolCheckpoints = await this.joker.numCheckpoints(carol);
      assert.equal(carolCheckpoints.valueOf(), '2');
      var bobCheckpoints = await this.joker.numCheckpoints(bob);
      assert.equal(bobCheckpoints.valueOf(), '0');
    });

    it('should have correct PriorVotes with height3 and height2 after advanceBlock', async () => {
      await time.advanceBlock();
      height3 = await web3.eth.getBlockNumber() - 1;
      var alicePriorlVotes = await this.joker.getPriorVotes(alice, height3);
      assert.equal(alicePriorlVotes.valueOf(), '300');
      var carolPriorlVotes = await this.joker.getPriorVotes(carol, height3);
      assert.equal(carolPriorlVotes.valueOf(), '0');
      var bobPriorlVotes = await this.joker.getPriorVotes(bob, height3);
      assert.equal(bobPriorlVotes.valueOf(), '0');

      var alicePriorlVotes = await this.joker.getPriorVotes(alice, height2);
      assert.equal(alicePriorlVotes.valueOf(), '100');
      var carolPriorlVotes = await this.joker.getPriorVotes(carol, height2);
      assert.equal(carolPriorlVotes.valueOf(), '200');
      var bobPriorlVotes = await this.joker.getPriorVotes(bob, height2);
      assert.equal(bobPriorlVotes.valueOf(), '0');
    });

    it('should have correct CurrentVotes and numCheckpoints after mint to bob', async () => {
      await this.joker.mint(bob, '400', { from: alice });
      var aliceVotes = await this.joker.getCurrentVotes(alice);
      assert.equal(aliceVotes.valueOf(), '700');
      var carolVotes = await this.joker.getCurrentVotes(carol);
      assert.equal(carolVotes.valueOf(), '0');
      var bobVotes = await this.joker.getCurrentVotes(bob);
      assert.equal(bobVotes.valueOf(), '0');

      var aliceCheckpoints = await this.joker.numCheckpoints(alice);
      assert.equal(aliceCheckpoints.valueOf(), '3');
      var carolCheckpoints = await this.joker.numCheckpoints(carol);
      assert.equal(carolCheckpoints.valueOf(), '2');
      var bobCheckpoints = await this.joker.numCheckpoints(bob);
      assert.equal(bobCheckpoints.valueOf(), '0');
    });

    it('should have correct PriorVotes with height4 and height3 after advanceBlock', async () => {
      await time.advanceBlock();
      height4 = await web3.eth.getBlockNumber() - 1;
      var alicePriorlVotes = await this.joker.getPriorVotes(alice, height4);
      assert.equal(alicePriorlVotes.valueOf(), '700');
      var carolPriorlVotes = await this.joker.getPriorVotes(carol, height4);
      assert.equal(carolPriorlVotes.valueOf(), '0');
      var bobPriorlVotes = await this.joker.getPriorVotes(bob, height4);
      assert.equal(bobPriorlVotes.valueOf(), '0');

      var alicePriorlVotes = await this.joker.getPriorVotes(alice, height3);
      assert.equal(alicePriorlVotes.valueOf(), '300');
      var carolPriorlVotes = await this.joker.getPriorVotes(carol, height3);
      assert.equal(carolPriorlVotes.valueOf(), '0');
      var bobPriorlVotes = await this.joker.getPriorVotes(bob, height3);
      assert.equal(bobPriorlVotes.valueOf(), '0');
    });

    it('should have correct CurrentVotes and numCheckpoints after bob transfer to leo', async () => {
      await this.joker.transfer(leo, '100', { from: bob });
      var aliceVotes = await this.joker.getCurrentVotes(alice);
      assert.equal(aliceVotes.valueOf(), '600');
      var carolVotes = await this.joker.getCurrentVotes(carol);
      assert.equal(carolVotes.valueOf(), '0');
      var bobVotes = await this.joker.getCurrentVotes(bob);
      assert.equal(bobVotes.valueOf(), '0');

      var aliceCheckpoints = await this.joker.numCheckpoints(alice);
      assert.equal(aliceCheckpoints.valueOf(), '4');
      var carolCheckpoints = await this.joker.numCheckpoints(carol);
      assert.equal(carolCheckpoints.valueOf(), '2');
      var bobCheckpoints = await this.joker.numCheckpoints(bob);
      assert.equal(bobCheckpoints.valueOf(), '0');
    });

    it('should have correct PriorVotes with height5 and height4 after advanceBlock', async () => {
      await time.advanceBlock();
      height5 = await web3.eth.getBlockNumber() - 1;
      var alicePriorlVotes = await this.joker.getPriorVotes(alice, height5);
      assert.equal(alicePriorlVotes.valueOf(), '600');
      var carolPriorlVotes = await this.joker.getPriorVotes(carol, height5);
      assert.equal(carolPriorlVotes.valueOf(), '0');
      var bobPriorlVotes = await this.joker.getPriorVotes(bob, height5);
      assert.equal(bobPriorlVotes.valueOf(), '0');

      var alicePriorlVotes = await this.joker.getPriorVotes(alice, height4);
      assert.equal(alicePriorlVotes.valueOf(), '700');
      var carolPriorlVotes = await this.joker.getPriorVotes(carol, height4);
      assert.equal(carolPriorlVotes.valueOf(), '0');
      var bobPriorlVotes = await this.joker.getPriorVotes(bob, height4);
      assert.equal(bobPriorlVotes.valueOf(), '0');
    });

    it('should have correct CurrentVotes and numCheckpoints when transfer with both delegated', async () => {
      this.joker = await JokerToken.new({ from: alice });
      await this.joker.mint(bob, '200', { from: alice });
      await this.joker.mint(carol, '300', { from: alice });
      await this.joker.delegate(alice, { from: bob });
      await this.joker.delegate(leo, { from: carol });
      await this.joker.transfer(carol, '100', { from: bob });

      var aliceVotes = await this.joker.getCurrentVotes(alice);
      assert.equal(aliceVotes.valueOf(), '100');
      var leoVotes = await this.joker.getCurrentVotes(leo);
      assert.equal(leoVotes.valueOf(), '400');
      var bobVotes = await this.joker.getCurrentVotes(bob);
      assert.equal(bobVotes.valueOf(), '0');

      var aliceCheckpoints = await this.joker.numCheckpoints(alice);
      assert.equal(aliceCheckpoints.valueOf(), '2');
      var leoCheckpoints = await this.joker.numCheckpoints(leo);
      assert.equal(leoCheckpoints.valueOf(), '2');
      var bobCheckpoints = await this.joker.numCheckpoints(bob);
      assert.equal(bobCheckpoints.valueOf(), '0');
    });

    it('should have correct PriorVotes after advanceBlock', async () => {
      await time.advanceBlock();
      height6 = await web3.eth.getBlockNumber() - 1;
      var alicePriorlVotes = await this.joker.getPriorVotes(alice, height6);
      assert.equal(alicePriorlVotes.valueOf(), '100');
      var leoPriorlVotes = await this.joker.getPriorVotes(leo, height6);
      assert.equal(leoPriorlVotes.valueOf(), '400');
      var bobPriorlVotes = await this.joker.getPriorVotes(bob, height6);
      assert.equal(bobPriorlVotes.valueOf(), '0');
    });

    it('should have correct CurrentVotes and numCheckpoints when transferFrom with both delegated', async () => {
      await this.joker.approve(leo, '100', { from: carol });
      await this.joker.transferFrom(carol, bob, '100', { from: leo });

      var aliceVotes = await this.joker.getCurrentVotes(alice);
      assert.equal(aliceVotes.valueOf(), '200');
      var leoVotes = await this.joker.getCurrentVotes(leo);
      assert.equal(leoVotes.valueOf(), '300');
      var bobVotes = await this.joker.getCurrentVotes(bob);
      assert.equal(bobVotes.valueOf(), '0');

      var aliceCheckpoints = await this.joker.numCheckpoints(alice);
      assert.equal(aliceCheckpoints.valueOf(), '3');
      var leoCheckpoints = await this.joker.numCheckpoints(leo);
      assert.equal(leoCheckpoints.valueOf(), '3');
      var bobCheckpoints = await this.joker.numCheckpoints(bob);
      assert.equal(bobCheckpoints.valueOf(), '0');
    });

    it('should have correct PriorVotes with height7 and height6 after advanceBlock then', async () => {
      await time.advanceBlock();
      height7 = await web3.eth.getBlockNumber() - 1;
      var alicePriorlVotes = await this.joker.getPriorVotes(alice, height7);
      assert.equal(alicePriorlVotes.valueOf(), '200');
      var leoPriorlVotes = await this.joker.getPriorVotes(leo, height7);
      assert.equal(leoPriorlVotes.valueOf(), '300');
      var bobPriorlVotes = await this.joker.getPriorVotes(bob, height7);
      assert.equal(bobPriorlVotes.valueOf(), '0');

      var alicePriorlVotes = await this.joker.getPriorVotes(alice, height6);
      assert.equal(alicePriorlVotes.valueOf(), '100');
      var leoPriorlVotes = await this.joker.getPriorVotes(leo, height6);
      assert.equal(leoPriorlVotes.valueOf(), '400');
      var bobPriorlVotes = await this.joker.getPriorVotes(bob, height6);
      assert.equal(bobPriorlVotes.valueOf(), '0');
    });

    it('should have correct CurrentVotes and numCheckpoints when transferFrom with single delegated', async () => {
      await this.joker.approve(leo, '200', { from: carol });
      await this.joker.transferFrom(carol, leo, '200', { from: leo });

      var aliceVotes = await this.joker.getCurrentVotes(alice);
      assert.equal(aliceVotes.valueOf(), '200');
      var leoVotes = await this.joker.getCurrentVotes(leo);
      assert.equal(leoVotes.valueOf(), '100');
      var bobVotes = await this.joker.getCurrentVotes(bob);
      assert.equal(bobVotes.valueOf(), '0');

      var aliceCheckpoints = await this.joker.numCheckpoints(alice);
      assert.equal(aliceCheckpoints.valueOf(), '3');
      var leoCheckpoints = await this.joker.numCheckpoints(leo);
      assert.equal(leoCheckpoints.valueOf(), '4');
      var bobCheckpoints = await this.joker.numCheckpoints(bob);
      assert.equal(bobCheckpoints.valueOf(), '0');
    });

    it('should have correct PriorVotes with height8 and height7 after advanceBlock then', async () => {
      await time.advanceBlock();
      var height8 = await web3.eth.getBlockNumber() - 1;
      var alicePriorlVotes = await this.joker.getPriorVotes(alice, height8);
      assert.equal(alicePriorlVotes.valueOf(), '200');
      var leoPriorlVotes = await this.joker.getPriorVotes(leo, height8);
      assert.equal(leoPriorlVotes.valueOf(), '100');
      var bobPriorlVotes = await this.joker.getPriorVotes(bob, height8);
      assert.equal(bobPriorlVotes.valueOf(), '0');

      var alicePriorlVotes = await this.joker.getPriorVotes(alice, height7);
      assert.equal(alicePriorlVotes.valueOf(), '200');
      var leoPriorlVotes = await this.joker.getPriorVotes(leo, height7);
      assert.equal(leoPriorlVotes.valueOf(), '300');
      var bobPriorlVotes = await this.joker.getPriorVotes(bob, height7);
      assert.equal(bobPriorlVotes.valueOf(), '0');
    });
  })
})