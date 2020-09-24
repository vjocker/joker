const { ZERO_ADDRESS } = require('@openzeppelin/test-helpers/src/constants');
const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');
const MockERC20 = artifacts.require('MockERC20');
const MockLender = artifacts.require('MockLender');
const MockVaults = artifacts.require('MockVaults');
const JokerToken = artifacts.require('JokerToken');
const LordJoker = artifacts.require('LordJoker');
const Timelock = artifacts.require('Timelock');


contract('LordJoker', ([owner, minter, devAddr, timelockAdmin, lender, migrator]) => {
  beforeEach(async() => {
    this.startBlock = 0;
    this.halveNum = 200000;
    this.joker = await JokerToken.new({ from: owner });
    this.timelock = await Timelock.new(timelockAdmin, '172800', { from: owner });
    this.lordJoker = await LordJoker.new(this.joker.address, devAddr, this.timelock.address, this.startBlock, {from: owner});
    await this.joker.transferOwnership(this.lordJoker.address, {from : owner});
    this.jockerPerBlock = await this.lordJoker.jockerPerBlock();
  });

  describe('Constructor check', () => {
    it('should set correct state variables', async () => {
      const joker = await this.lordJoker.jocker();
      assert.equal(joker.valueOf(), this.joker.address);
      const devaddr = await this.lordJoker.devaddr();
      assert.equal(devaddr.valueOf(), devAddr);
      const treasury = await this.lordJoker.treasury();
      assert.equal(treasury.valueOf(), this.timelock.address);
      assert.equal(this.jockerPerBlock.valueOf(), 80 * 1e18, "jockerPerBlock");
      const MIN_JOCKERs = await this.lordJoker.MIN_JOCKERs();
      assert.equal(MIN_JOCKERs.valueOf(), 5 * 1e18, "MIN_JOCKERs");
      const MAX_SUPPLY = await this.lordJoker.MAX_SUPPLY();
      assert.equal(MAX_SUPPLY.valueOf(), 100000000 * 1e18, "MAX_SUPPLY");
      const HALVE_NUM = await this.lordJoker.HALVE_NUM();
      assert.equal(HALVE_NUM.valueOf(), this.halveNum, "HALVE_NUM: do you modify this value in LordJoker.sol too?");
      const halveBlockNum = await this.lordJoker.halveBlockNum();
      assert.equal(halveBlockNum.valueOf(), this.startBlock + HALVE_NUM.valueOf().toNumber(), "halveBlockNum");
      const migrator = await this.lordJoker.migrator();
      assert.equal(migrator.valueOf(), ZERO_ADDRESS, "migrator");
      const lender = await this.lordJoker.lender();
      assert.equal(lender.valueOf(), ZERO_ADDRESS, "lender");
      const vaults = await this.lordJoker.vaults();
      assert.equal(vaults.valueOf(), ZERO_ADDRESS, "vaults");
      const totalAllocPoint = await this.lordJoker.totalAllocPoint();
      assert.equal(totalAllocPoint.valueOf(), 0, "totalAllocPoint");
      const startBlock = await this.lordJoker.startBlock();
      assert.equal(startBlock.valueOf(), this.startBlock, "startBlock");
      const poolLength = await this.lordJoker.poolLength();
      assert.equal(poolLength.valueOf(), 0, "poolLength");

      const admin = await this.timelock.admin();
      assert.equal(admin.valueOf(), timelockAdmin, "timelockAdmin");
      const jokerowner = await this.joker.owner();
      assert.equal(jokerowner.valueOf(), this.lordJoker.address, "jokerowner");
    });
  });

  describe('Function add check', () => {
    beforeEach(async() => {
      this.pool1 = await MockERC20.new('TOKEN1', 'TOKEN1', '100000000', { from: minter });
      this.pool2 = await MockERC20.new('TOKEN2', 'TOKEN2', '100000000', { from: minter });
    });

    it('should not allow non-owner to add pool', async () => {
      await expectRevert(
        this.lordJoker.add(100, this.pool1.address, false, false, { from: minter }),
        'Ownable: caller is not the owner',
      );
      await expectRevert(
        this.lordJoker.add(100, this.pool1.address, false, false, { from: devAddr }),
        'Ownable: caller is not the owner',
      );
    });

    it('should allow owner to add pool correctly', async () => {
      await this.lordJoker.add(100, this.pool1.address, false, false, { from: owner });
      const poolLength = await this.lordJoker.poolLength();
      assert.equal(poolLength.valueOf(), 1, "poolLength");
      const totalAllocPoint = await this.lordJoker.totalAllocPoint();
      assert.equal(totalAllocPoint.valueOf(), 100, "totalAllocPoint");

      const pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.lendPool.valueOf(), false);
      assert.equal(pool0Info.lpToken.valueOf(), this.pool1.address);
      assert.equal(pool0Info.allocPoint.valueOf(), 100);
      assert.equal(pool0Info.lastRewardBlock.valueOf(), await web3.eth.getBlockNumber());
      assert.equal(pool0Info.accJockerPerShare.valueOf(), 0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 0);
    });

    it('should work well when add more pools', async () => {
      await this.lordJoker.add(100, this.pool1.address, false, false, { from: owner });
      await this.lordJoker.add(200, this.pool2.address, false, false, { from: owner });
      const poolLength = await this.lordJoker.poolLength();
      assert.equal(poolLength.valueOf(), 2, "poolLength");
      const totalAllocPoint = await this.lordJoker.totalAllocPoint();
      assert.equal(totalAllocPoint.valueOf(), 300, "totalAllocPoint");

      const pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.lendPool.valueOf(), false);
      assert.equal(pool0Info.lpToken.valueOf(), this.pool1.address);
      assert.equal(pool0Info.allocPoint.valueOf(), 100);
      assert.equal(pool0Info.lastRewardBlock.valueOf(), await web3.eth.getBlockNumber() - 1);
      assert.equal(pool0Info.accJockerPerShare.valueOf(), 0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 0);
      const pool1Info = await this.lordJoker.poolInfo(1);
      assert.equal(pool1Info.lendPool.valueOf(), false);
      assert.equal(pool1Info.lpToken.valueOf(), this.pool2.address);
      assert.equal(pool1Info.allocPoint.valueOf(), 200);
      assert.equal(pool1Info.lastRewardBlock.valueOf(), await web3.eth.getBlockNumber());
      assert.equal(pool1Info.accJockerPerShare.valueOf(), 0);
      assert.equal(pool1Info.totalDeposit.valueOf(), 0);
    });

    it('should work well when add more pools with _withUpdate', async () => {
      await this.lordJoker.add(100, this.pool1.address, false, false, { from: owner });
      await this.lordJoker.add(200, this.pool2.address, true, false, { from: owner });
      const poolLength = await this.lordJoker.poolLength();
      assert.equal(poolLength.valueOf(), 2, "poolLength");
      const totalAllocPoint = await this.lordJoker.totalAllocPoint();
      assert.equal(totalAllocPoint.valueOf(), 300, "totalAllocPoint");

      const pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.lendPool.valueOf(), false);
      assert.equal(pool0Info.lpToken.valueOf(), this.pool1.address);
      assert.equal(pool0Info.allocPoint.valueOf(), 100);
      assert.equal(pool0Info.lastRewardBlock.valueOf(), await web3.eth.getBlockNumber());
      assert.equal(pool0Info.accJockerPerShare.valueOf(), 0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 0);
      const pool1Info = await this.lordJoker.poolInfo(1);
      assert.equal(pool1Info.lendPool.valueOf(), false);
      assert.equal(pool1Info.lpToken.valueOf(), this.pool2.address);
      assert.equal(pool1Info.allocPoint.valueOf(), 200);
      assert.equal(pool1Info.lastRewardBlock.valueOf(), await web3.eth.getBlockNumber());
      assert.equal(pool1Info.accJockerPerShare.valueOf(), 0);
      assert.equal(pool1Info.totalDeposit.valueOf(), 0);
    });

    it('should only allow owner to add lend pool after set lender', async () => {
      await expectRevert(
        this.lordJoker.add(100, this.pool1.address, false, true, { from: owner }),
        'add: no lender',
      );
      this.lender = await MockLender.new(this.lordJoker.address, { from: owner });
      await this.lordJoker.setLender(this.lender.address);
      await expectRevert(
        this.lordJoker.add(100, this.pool1.address, false, true, { from: minter }),
        'Ownable: caller is not the owner',
      );
      await this.lordJoker.add(100, this.pool1.address, false, true, { from: owner });
      const poolInfo = await this.lordJoker.poolInfo(0);
      assert.equal(poolInfo.lendPool.valueOf(), true);
      const poolLength = await this.lordJoker.poolLength();
      assert.equal(poolLength.valueOf(), 1, "poolLength");
      const totalAllocPoint = await this.lordJoker.totalAllocPoint();
      assert.equal(totalAllocPoint.valueOf(), 100, "totalAllocPoint");
    });
  });

  describe('Function set check', () => {
    beforeEach(async() => {
      this.pool1 = await MockERC20.new('TOKEN1', 'TOKEN1', '100000000', { from: minter });
      this.pool2 = await MockERC20.new('TOKEN2', 'TOKEN2', '100000000', { from: minter });
    });

    it('should not allow non-owner to set pool', async () => {
      await this.lordJoker.add(100, this.pool1.address, false, false, { from: owner });
      await expectRevert(
        this.lordJoker.set(0, 200, false, { from: minter }),
        'Ownable: caller is not the owner',
      );
      await expectRevert(
        this.lordJoker.set(0, 200, false, { from: devAddr }),
        'Ownable: caller is not the owner',
      );
    });

    it('should allow owner to set pool correctly', async () => {
      await this.lordJoker.add(100, this.pool1.address, false, false, { from: owner });
      await this.lordJoker.set(0, 200, false, { from: owner });
      const poolLength = await this.lordJoker.poolLength();
      assert.equal(poolLength.valueOf(), 1, "poolLength");
      const totalAllocPoint = await this.lordJoker.totalAllocPoint();
      assert.equal(totalAllocPoint.valueOf(), 200, "totalAllocPoint");

      const pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.lendPool.valueOf(), false);
      assert.equal(pool0Info.lpToken.valueOf(), this.pool1.address);
      assert.equal(pool0Info.allocPoint.valueOf(), 200);
      assert.equal(pool0Info.lastRewardBlock.valueOf(), await web3.eth.getBlockNumber() - 1);
      assert.equal(pool0Info.accJockerPerShare.valueOf(), 0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 0);
    });

    it('should work well when set more pools', async () => {
      await this.lordJoker.add(100, this.pool1.address, false, false, { from: owner });
      await this.lordJoker.add(200, this.pool2.address, false, false, { from: owner });
      await this.lordJoker.set(0, 200, false, { from: owner });
      await this.lordJoker.set(1, 300, false, { from: owner });
      const poolLength = await this.lordJoker.poolLength();
      assert.equal(poolLength.valueOf(), 2, "poolLength");
      const totalAllocPoint = await this.lordJoker.totalAllocPoint();
      assert.equal(totalAllocPoint.valueOf(), 500, "totalAllocPoint");

      const pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.lendPool.valueOf(), false);
      assert.equal(pool0Info.lpToken.valueOf(), this.pool1.address);
      assert.equal(pool0Info.allocPoint.valueOf(), 200);
      assert.equal(pool0Info.lastRewardBlock.valueOf(), await web3.eth.getBlockNumber() - 3);
      assert.equal(pool0Info.accJockerPerShare.valueOf(), 0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 0);
      const pool1Info = await this.lordJoker.poolInfo(1);
      assert.equal(pool1Info.lendPool.valueOf(), false);
      assert.equal(pool1Info.lpToken.valueOf(), this.pool2.address);
      assert.equal(pool1Info.allocPoint.valueOf(), 300);
      assert.equal(pool1Info.lastRewardBlock.valueOf(), await web3.eth.getBlockNumber() - 2);
      assert.equal(pool1Info.accJockerPerShare.valueOf(), 0);
      assert.equal(pool1Info.totalDeposit.valueOf(), 0);
    });

    it('should work well when set more pools with _withUpdate', async () => {
      await this.lordJoker.add(100, this.pool1.address, false, false, { from: owner });
      await this.lordJoker.add(200, this.pool2.address, true, false, { from: owner });
      await this.lordJoker.set(0, 200, true, { from: owner });
      await this.lordJoker.set(1, 300, true, { from: owner });
      const poolLength = await this.lordJoker.poolLength();
      assert.equal(poolLength.valueOf(), 2, "poolLength");
      const totalAllocPoint = await this.lordJoker.totalAllocPoint();
      assert.equal(totalAllocPoint.valueOf(), 500, "totalAllocPoint");

      const pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.lendPool.valueOf(), false);
      assert.equal(pool0Info.lpToken.valueOf(), this.pool1.address);
      assert.equal(pool0Info.allocPoint.valueOf(), 200);
      assert.equal(pool0Info.lastRewardBlock.valueOf(), await web3.eth.getBlockNumber());
      assert.equal(pool0Info.accJockerPerShare.valueOf(), 0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 0);
      const pool1Info = await this.lordJoker.poolInfo(1);
      assert.equal(pool1Info.lendPool.valueOf(), false);
      assert.equal(pool1Info.lpToken.valueOf(), this.pool2.address);
      assert.equal(pool1Info.allocPoint.valueOf(), 300);
      assert.equal(pool1Info.lastRewardBlock.valueOf(), await web3.eth.getBlockNumber());
      assert.equal(pool1Info.accJockerPerShare.valueOf(), 0);
      assert.equal(pool1Info.totalDeposit.valueOf(), 0);
    });
  });

  describe('Function transferOwnership check', () => {
    it('should not allow non-owner to transferOwnership', async () => {
      await expectRevert(
        this.lordJoker.transferOwnership(timelockAdmin, { from: minter }),
        'Ownable: caller is not the owner',
      );
      await expectRevert(
        this.lordJoker.transferOwnership(timelockAdmin, { from: devAddr }),
        'Ownable: caller is not the owner',
      );
    });

    it('should allow owner to transferOwnership', async () => {
      await this.lordJoker.transferOwnership(this.timelock.address, { from: owner });
      const lordJokerowner = await this.lordJoker.owner();
      assert.equal(lordJokerowner.valueOf(), this.timelock.address);
    });
  });
  
  describe('Function transferTokenOwner check', () => {
    it('should not allow non-owner to transferTokenOwner', async () => {
      await expectRevert(
        this.lordJoker.transferTokenOwner(timelockAdmin, { from: minter }),
        'Ownable: caller is not the owner',
      );
      await expectRevert(
        this.lordJoker.transferTokenOwner(timelockAdmin, { from: devAddr }),
        'Ownable: caller is not the owner',
      );
    });

    it('should allow owner to transferTokenOwner', async () => {
      await this.lordJoker.transferTokenOwner(timelockAdmin, { from: owner });
      const jokerowner = await this.joker.owner();
      assert.equal(jokerowner.valueOf(), timelockAdmin);
    });
  });

  describe('Function setMigrator check', () => {
    it('should not allow non-owner to setMigrator', async () => {
      await expectRevert(
        this.lordJoker.setMigrator(timelockAdmin, { from: minter }),
        'Ownable: caller is not the owner',
      );
      await expectRevert(
        this.lordJoker.setMigrator(timelockAdmin, { from: devAddr }),
        'Ownable: caller is not the owner',
      );
    });

    it('should allow owner to setMigrator', async () => {
      await this.lordJoker.setMigrator(devAddr, { from: owner });
      const migrator = await this.lordJoker.migrator();
      assert.equal(migrator.valueOf(), devAddr);
    });
  });

  describe('Function migrate check', () => {
    beforeEach(async() => {
      this.pool1 = await MockERC20.new('TOKEN1', 'TOKEN1', '100000000', { from: minter });
      await this.lordJoker.add(100, this.pool1.address, false, false, { from: owner });
    });

    it('should not allow to migrate before setMigrator', async () => {
      await expectRevert(
        this.lordJoker.migrate(0, { from: minter }),
        'migrate: no migrator',
      );
      await expectRevert(
        this.lordJoker.migrate(0, { from: owner }),
        'migrate: no migrator',
      );
    });

    it.skip('should allow to migrate after setMigrator', async () => {
      await this.pool1.approve(this.lordJoker.address, '1000', { from: minter });
      await this.lordJoker.deposit(minter, 0, 1000, {from: minter});
      const oldBal = await this.pool1.balanceOf(this.lordJoker.address);
      await this.lordJoker.setMigrator(migrator, { from: owner });
      await this.lordJoker.migrate(0, { from: owner });
      const pool0Info = await this.lordJoker.poolInfo(0);
      const newBal = await pool0Info.lpToken.balanceOf(this.lordJoker.address);
      assert.notEqual(this.pool1.address, pool0Info.lpToken.valueOf());
      assert.equal(newBal.valueOf(), oldBal.valueOf());
      assert.equal(pool0Info.lendPool.valueOf(), false);
      assert.equal(pool0Info.allocPoint.valueOf(), 100);
    });
  });

  describe('Function setLender check', () => {
    it('should not allow non-owner to setLender', async () => {
      await expectRevert(
        this.lordJoker.setLender(timelockAdmin, { from: minter }),
        'Ownable: caller is not the owner',
      );
      await expectRevert(
        this.lordJoker.setLender(timelockAdmin, { from: devAddr }),
        'Ownable: caller is not the owner',
      );
    });

    it('should allow owner to setLender', async () => {
      this.lender = await MockLender.new(this.lordJoker.address, { from: owner });
      await this.lordJoker.setLender(this.lender.address, { from: owner });
      const lender = await this.lordJoker.lender();
      assert.equal(lender.valueOf(), this.lender.address);
    });
  });

  describe('Function lendToken check', () => {
    beforeEach(async() => {
      this.pool1 = await MockERC20.new('TOKEN1', 'TOKEN1', '100000000', { from: minter });
      await this.lordJoker.add(100, this.pool1.address, false, false, { from: owner });
      await this.pool1.approve(this.lordJoker.address, '1000', { from: minter });
      await this.lordJoker.deposit(minter, 0, '100', {from: minter});
    });

    it('should not allow all to lendToken before set lender', async () => {
      this.joker = await JokerToken.new({ from: owner });
      this.timelock = await Timelock.new(timelockAdmin, '172800', { from: owner });
      this.lordJoker = await LordJoker.new(this.joker.address, devAddr, this.timelock.address, this.startBlock, {from: owner});
      await this.joker.transferOwnership(this.lordJoker.address, {from : owner});
      assert.equal(await this.lordJoker.lender().valueOf(), ZERO_ADDRESS);
      await expectRevert(
        this.lordJoker.lendToken(owner, 0, '100', { from: owner }),
        'lendToken: no lender',
      );
      await expectRevert(
        this.lordJoker.lendToken(lender, 0, '100', { from: lender }),
        'lendToken: no lender',
      );
    });

    it('should not allow non-lender to lendToken after set lender', async() => {
      this.lender = await MockLender.new(this.lordJoker.address, { from: owner });
      await this.lordJoker.setLender(this.lender.address, { from: owner });
      assert.equal(await this.lordJoker.lender().valueOf(), this.lender.address);
      await expectRevert(
        this.lordJoker.lendToken(owner, 0, '100', { from: owner }),
        'lendToken: caller must be lender',
      );
      await expectRevert(
        this.lordJoker.lendToken(devAddr, 0, '100', { from: devAddr }),
        'lendToken: caller must be lender',
      );
    });

    it('should not allow lendToken to address(0)', async() => {
      this.lender = await MockLender.new(this.lordJoker.address, { from: owner });
      await this.lordJoker.setLender(this.lender.address, { from: owner });
      await expectRevert(
        this.lender.lend(ZERO_ADDRESS, 0, '100', { from: owner }),
        'lendToken: can not lend to 0',
      );
    });

    it('should lendToken correctly', async () => {
      var baldevAddr = await this.pool1.balanceOf(devAddr);
      assert.equal(baldevAddr.valueOf(), 0);
      var balLorJoker = await this.pool1.balanceOf(this.lordJoker.address);
      assert.equal(balLorJoker.valueOf(), 100);
      this.lender = await MockLender.new(this.lordJoker.address, { from: owner });
      await this.lordJoker.setLender(this.lender.address, { from: owner });
      await this.lender.lend(devAddr, 0, '100', { from: owner });
      var baldevAddr = await this.pool1.balanceOf(devAddr);
      assert.equal(baldevAddr.valueOf(), 100);
      var balLorJoker = await this.pool1.balanceOf(this.lordJoker.address);
      assert.equal(balLorJoker.valueOf(), 0);
    });
  });

  describe('Function setVaults check', () => {
    it('should not allow non-owner to setVaults', async () => {
      await expectRevert(
        this.lordJoker.setVaults(timelockAdmin, { from: minter }),
        'Ownable: caller is not the owner',
      );
      await expectRevert(
        this.lordJoker.setVaults(timelockAdmin, { from: devAddr }),
        'Ownable: caller is not the owner',
      );
    });

    it('should allow owner to setVaults', async () => {
      this.vaults = await MockVaults.new(this.lordJoker.address, { from: owner });
      await this.lordJoker.setVaults(this.vaults.address, { from: owner });
      const vaults = await this.lordJoker.vaults();
      assert.equal(vaults.valueOf(), this.vaults.address);
    });

    it('should not allow vaults to setVaults', async () => {
      await this.lordJoker.setVaults(devAddr, { from: owner });
      const vaults = await this.lordJoker.vaults();
      assert.equal(vaults.valueOf(), devAddr);
      await expectRevert(
        this.lordJoker.setVaults(timelockAdmin, { from: devAddr }),
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('Function transferTokenToVaults check', () => {
    beforeEach(async() => {
      this.pool1 = await MockERC20.new('TOKEN1', 'TOKEN1', '100000000', { from: minter });
      await this.lordJoker.add(100, this.pool1.address, false, false, { from: owner });
      await this.pool1.approve(this.lordJoker.address, '1000', { from: minter });
      await this.lordJoker.deposit(minter, 0, '100', {from: minter});
    });

    it('should not allow all to transferTokenToVaults before set vaults', async () => {
      this.joker = await JokerToken.new({ from: owner });
      this.timelock = await Timelock.new(timelockAdmin, '172800', { from: owner });
      this.lordJoker = await LordJoker.new(this.joker.address, devAddr, this.timelock.address, this.startBlock, {from: owner});
      await this.joker.transferOwnership(this.lordJoker.address, {from : owner});
      assert.equal(await this.lordJoker.vaults().valueOf(), ZERO_ADDRESS);
      await expectRevert(
        this.lordJoker.transferTokenToVaults(0, '100', { from: owner }),
        'transferTokenToVaults: no vaults',
      );
      await expectRevert(
        this.lordJoker.transferTokenToVaults(0, '100', { from: devAddr }),
        'transferTokenToVaults: no vaults',
      );
    });

    it('should not allow non-vaults to transferTokenToVaults after set vaults', async() => {
      this.vaults = await MockVaults.new(this.lordJoker.address, { from: owner });
      await this.lordJoker.setVaults(this.vaults.address, { from: owner });
      assert.equal(await this.lordJoker.vaults().valueOf(), this.vaults.address);
      await expectRevert(
        this.lordJoker.transferTokenToVaults(0, '100', { from: owner }),
        'transferTokenToVaults: caller must be vaults',
      );
      await expectRevert(
        this.lordJoker.transferTokenToVaults(0, '100', { from: devAddr }),
        'transferTokenToVaults: caller must be vaults',
      );
    });

    it('should transferTokenToVaults correctly', async () => {
      this.vaults = await MockVaults.new(this.lordJoker.address, { from: owner });
      await this.lordJoker.setVaults(this.vaults.address, { from: owner });
      var balvaults = await this.pool1.balanceOf(this.vaults.address);
      assert.equal(balvaults.valueOf(), 0);
      var balLorJoker = await this.pool1.balanceOf(this.lordJoker.address);
      assert.equal(balLorJoker.valueOf(), 100);
      await this.vaults.getToken(0, '100', { from: owner });
      var balvaults = await this.pool1.balanceOf(this.vaults.address);
      assert.equal(balvaults.valueOf(), 100);
      var balLorJoker = await this.pool1.balanceOf(this.lordJoker.address);
      assert.equal(balLorJoker.valueOf(), 0);
    });
  });

  describe('Function pendingJocker check', () => {
    beforeEach(async() => {
      this.pool1 = await MockERC20.new('TOKEN1', 'TOKEN1', '100000000', { from: minter });
      await this.lordJoker.add(100, this.pool1.address, false, false, { from: owner });
    });
    
    it('should get correct number with one pool one user', async() => {
      await this.pool1.approve(this.lordJoker.address, '1000', { from: minter });
      await this.lordJoker.deposit(minter, 0, 1000, { from: minter });
      await time.advanceBlock();
      const pendingJocker = await this.lordJoker.pendingJocker(0, minter);
      assert.equal(pendingJocker.valueOf(), this.jockerPerBlock * 80 / 100);
    });

    it('should get correct number with one pool two user', async() => {
      await this.pool1.transfer(devAddr, 1000, { from: minter });
      await this.pool1.approve(this.lordJoker.address, '1000', { from: minter });
      await this.pool1.approve(this.lordJoker.address, '1000', { from: devAddr });
      await this.lordJoker.deposit(minter, 0, 1000, { from: minter });
      await this.lordJoker.deposit(devAddr, 0, 1000, { from: devAddr });
      var pendingJocker = await this.lordJoker.pendingJocker(0, minter);
      var minterShouldHave = this.jockerPerBlock * 80 / 100;
      assert.equal(pendingJocker.valueOf(), minterShouldHave);
      await time.advanceBlock();
      var pendingJocker = await this.lordJoker.pendingJocker(0, devAddr);
      assert.equal(pendingJocker.valueOf(), this.jockerPerBlock * 80 / 100 / 2);
      var pendingJocker = await this.lordJoker.pendingJocker(0, minter);
      assert.equal(pendingJocker.valueOf(), minterShouldHave + this.jockerPerBlock * 80 / 100 / 2);
    });

    it('should get correct number with two pool one user', async() => {
      this.pool2 = await MockERC20.new('TOKEN2', 'TOKEN2', '100000000', { from: minter });
      await this.lordJoker.add(200, this.pool2.address, false, false, { from: owner });
      await this.pool1.approve(this.lordJoker.address, '1000', { from: minter });
      await this.lordJoker.deposit(minter, 0, 1000, { from: minter });
      await time.advanceBlock();
      const pendingJocker = await this.lordJoker.pendingJocker(0, minter);
      assert.equal(pendingJocker.valueOf(), this.jockerPerBlock * 80 / 100 / 3);
    });

    it('should get correct number with two pool two user', async() => {
      this.pool2 = await MockERC20.new('TOKEN2', 'TOKEN2', '100000000', { from: minter });
      await this.lordJoker.add(700, this.pool2.address, false, false, { from: owner });
      await this.pool1.transfer(devAddr, 2000, { from: minter });
      await this.pool2.transfer(devAddr, 3000, { from: minter });
      await this.pool1.approve(this.lordJoker.address, '15000', { from: minter });
      await this.pool1.approve(this.lordJoker.address, '1000', { from: devAddr });
      await this.pool2.approve(this.lordJoker.address, '1000', { from: minter });
      await this.pool2.approve(this.lordJoker.address, '3000', { from: devAddr });
      await this.lordJoker.deposit(minter, 0, 15000, { from: minter });
      await this.lordJoker.deposit(devAddr, 0, 1000, { from: devAddr });
      await this.lordJoker.deposit(minter, 1, 1000, { from: minter });
      await this.lordJoker.deposit(devAddr, 1, 3000, { from: devAddr });
      const jokerPerBlock = this.jockerPerBlock * 80 / 100;
      var pendingJocker = await this.lordJoker.pendingJocker(0, minter);
      assert.equal(pendingJocker.valueOf(), (jokerPerBlock + jokerPerBlock * 15 / 16 * 2) / 8);
      var pendingJocker = await this.lordJoker.pendingJocker(0, devAddr);
      assert.equal(pendingJocker.valueOf(), (jokerPerBlock * 1 / 16 * 2) / 8);
      var pendingJocker = await this.lordJoker.pendingJocker(1, minter);
      assert.equal(pendingJocker.valueOf(), jokerPerBlock * 7 / 8);
      var pendingJocker = await this.lordJoker.pendingJocker(1, devAddr);
      assert.equal(pendingJocker.valueOf(), 0);
      await time.advanceBlock();
      var pendingJocker = await this.lordJoker.pendingJocker(0, minter);
      assert.equal(pendingJocker.valueOf(), (jokerPerBlock + jokerPerBlock * 15 / 16 * 3) / 8);
      var pendingJocker = await this.lordJoker.pendingJocker(0, devAddr);
      assert.equal(pendingJocker.valueOf(), (jokerPerBlock * 1 / 16 * 3) / 8);
      var pendingJocker = await this.lordJoker.pendingJocker(1, minter);
      assert.equal(pendingJocker.valueOf(), (jokerPerBlock + jokerPerBlock / 4) * 7 / 8);
      var pendingJocker = await this.lordJoker.pendingJocker(1, devAddr);
      assert.equal(pendingJocker.valueOf(), (jokerPerBlock * 3 / 4) * 7 / 8);
    });
  });

  describe('Function updatePool check', () => {
    beforeEach(async() => {
      this.pool1 = await MockERC20.new('TOKEN1', 'TOKEN1', '100000000', { from: minter });
      await this.lordJoker.add(100, this.pool1.address, false, false, { from: owner });
    });

    it('should not update when joker totalSupply >= MAX_SUPPLY', async () => {
      const MAX_SUPPLY = await this.lordJoker.MAX_SUPPLY().valueOf();
      await this.lordJoker.transferTokenOwner(owner, { from: owner });
      await this.pool1.approve(this.lordJoker.address, '1000', { from: minter });
      await this.lordJoker.deposit(minter, 0, 1000, { from: minter });
      const mintNum = (MAX_SUPPLY / 1e18 - this.jockerPerBlock * 4 / 1e18).toString() + '000000000000000000';
      await this.joker.mint(owner, mintNum, { from: owner });
      await this.joker.transferOwnership(this.lordJoker.address, {from : owner});
      await this.lordJoker.massUpdatePools({ from: minter });
      var totalSupply = await this.joker.totalSupply();
      assert.equal(totalSupply.valueOf(), MAX_SUPPLY - this.jockerPerBlock * 1);
      await this.lordJoker.massUpdatePools({ from: minter });
      var totalSupply = await this.joker.totalSupply();
      assert.equal(totalSupply.valueOf().toString(), MAX_SUPPLY.toString());
      await time.advanceBlock();
      await this.lordJoker.massUpdatePools({ from: minter });
      var totalSupply = await this.joker.totalSupply();
      assert.equal(totalSupply.valueOf().toString(), MAX_SUPPLY.toString());
    });

    it('should not have rewards before startBlock', async () => {
      this.joker = await JokerToken.new({ from: owner });
      this.timelock = await Timelock.new(timelockAdmin, '172800', { from: owner });
      const startBlock = await web3.eth.getBlockNumber() + 20;
      this.lordJoker = await LordJoker.new(this.joker.address, devAddr, this.timelock.address, startBlock, {from: owner});
      await this.joker.transferOwnership(this.lordJoker.address, {from : owner});
      this.pool1 = await MockERC20.new('TOKEN1', 'TOKEN1', '100000000', { from: minter });
      await this.pool1.approve(this.lordJoker.address, '1000', { from: minter });
      await this.lordJoker.add(100, this.pool1.address, false, false, { from: owner });
      await this.lordJoker.deposit(minter, 0, 1000, { from: minter });
      await time.advanceBlockTo(startBlock - 10);
      await this.lordJoker.massUpdatePools({ from: minter });
      assert.equal(await this.joker.totalSupply(), 0);
      await time.advanceBlockTo(startBlock - 7);
      await this.lordJoker.massUpdatePools({ from: minter });
      assert.equal(await this.joker.totalSupply(), 0);
      await time.advanceBlockTo(startBlock - 4);
      await this.lordJoker.massUpdatePools({ from: minter });
      assert.equal(await this.joker.totalSupply(), 0);
      await time.advanceBlockTo(startBlock - 1);
      await this.lordJoker.massUpdatePools({ from: minter });
      assert.equal(await this.joker.totalSupply(), 0);
      await time.advanceBlockTo(startBlock + 1);
      await this.lordJoker.massUpdatePools({ from: minter });
      assert.equal(await this.joker.totalSupply(), this.jockerPerBlock * 2);
      await time.advanceBlockTo(startBlock + 4);
      await this.lordJoker.massUpdatePools({ from: minter });
      assert.equal(await this.joker.totalSupply(), this.jockerPerBlock * 5);
    });

    it('should not update when pool.totalDeposit == 0', async () => {
      const initHeight = await web3.eth.getBlockNumber();
      var pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.lastRewardBlock.valueOf(), initHeight);
      assert.equal(pool0Info.totalDeposit.valueOf(), 0);
      const initTotalSupply = await this.joker.totalSupply();

      await this.lordJoker.massUpdatePools({ from: minter });
      assert.equal(initHeight + 1, await web3.eth.getBlockNumber());
      var pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.lastRewardBlock.valueOf(), initHeight + 1);
      assert.equal(pool0Info.totalDeposit.valueOf(), 0);
      var totalSupply = await this.joker.totalSupply();
      assert.equal(totalSupply.toString(), initTotalSupply.toString());

      await time.advanceBlock();
      await this.lordJoker.massUpdatePools({ from: minter });
      assert.equal(initHeight + 3, await web3.eth.getBlockNumber());
      var pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.lastRewardBlock.valueOf(), initHeight + 3);
      assert.equal(pool0Info.totalDeposit.valueOf(), 0);
      var totalSupply = await this.joker.totalSupply();
      assert.equal(totalSupply.toString(), initTotalSupply.toString());
    });

    it('should update correctly', async () => {
      await this.pool1.approve(this.lordJoker.address, '1000', { from: minter });
      await this.lordJoker.deposit(minter, 0, 1000, { from: minter });

      const initHeight = await web3.eth.getBlockNumber();
      var pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.lastRewardBlock.valueOf(), initHeight);
      assert.equal(pool0Info.accJockerPerShare.valueOf(), 0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 1000);
      const initTotalSupply = await this.joker.totalSupply();

      await this.lordJoker.massUpdatePools({ from: minter });
      assert.equal(initHeight + 1, await web3.eth.getBlockNumber());
      var devBal =  await this.joker.balanceOf(devAddr);
      assert.equal(devBal, this.jockerPerBlock * 10 / 100);
      var timelockBal =  await this.joker.balanceOf(this.timelock.address);
      assert.equal(timelockBal, this.jockerPerBlock * 10 / 100);
      var lordJokerBal =  await this.joker.balanceOf(this.lordJoker.address);
      assert.equal(lordJokerBal, this.jockerPerBlock * 80 / 100);
      var pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.lastRewardBlock.valueOf(), initHeight + 1);
      assert.equal(pool0Info.accJockerPerShare.valueOf() / 1e12, this.jockerPerBlock * 80 / 100 / 1000);
      assert.equal(pool0Info.totalDeposit.valueOf(), 1000);
      var totalSupply = await this.joker.totalSupply();
      assert.equal(totalSupply, Number(initTotalSupply + this.jockerPerBlock));
    });
  });

  describe('Function deposit check', () => {
    beforeEach(async() => {
      this.pool1 = await MockERC20.new('TOKEN1', 'TOKEN1', '100000000', { from: minter });
      await this.lordJoker.add(100, this.pool1.address, false, false, { from: owner });
      await this.pool1.approve(this.lordJoker.address, '1000', { from: minter });
    });

    it('should not allow to deposit other token', async() => {
      await expectRevert(
        this.lordJoker.deposit(minter, 0, '100', { from: owner }),
        'deposit: caller must be _user',
      );
      await expectRevert(
        this.lordJoker.deposit(minter, 0, '100', { from: devAddr }),
        'deposit: caller must be _user',
      );
    });

    it('should not allow user to deposit after set lender', async() => {
      this.lender = await MockLender.new(this.lordJoker.address, { from: owner });
      await this.lordJoker.setLender(this.lender.address, { from: owner });
      await expectRevert(
        this.lordJoker.deposit(minter, 0, '100', {from: minter}),
        'deposit: caller must be lender',
      );
    });

    it('should not allow user to deposit lend pool', async() => {
      this.lender = await MockLender.new(this.lordJoker.address, { from: owner });
      await this.lordJoker.setLender(this.lender.address, { from: owner });
      this.pool2 = await MockERC20.new('TOKEN1', 'TOKEN1', '100000000', { from: minter });
      await this.lordJoker.add(100, this.pool2.address, false, true, { from: owner });
      await this.pool2.approve(this.lordJoker.address, '1000', { from: minter });
      await this.lordJoker.setLender(ZERO_ADDRESS, { from: owner });
      await expectRevert(
        this.lordJoker.deposit(minter, 1, '100', {from: minter}),
        'deposit: can not be lendPool',
      );
    });
  
    it('should allow user to deposit correctly', async() => {
      await this.lordJoker.deposit(minter, 0, '100', {from: minter});
      var jokerbalMinter = await this.joker.balanceOf(minter);
      assert.equal(jokerbalMinter.valueOf(), 0);
      var pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 100);
      var userInfo = await this.lordJoker.userInfo(0, minter);
      assert.equal(userInfo.amount.valueOf(), 100);
      assert.equal(userInfo.rewardDebt.valueOf(), 0);
      var balMinter = await this.pool1.balanceOf(minter);
      assert.equal(balMinter.valueOf(), 100000000 - 100);
      var balLorJoker = await this.pool1.balanceOf(this.lordJoker.address);
      assert.equal(balLorJoker.valueOf(), 100);

      await this.lordJoker.deposit(minter, 0, '100', {from: minter});
      var jokerbalMinter = await this.joker.balanceOf(minter);
      assert.equal(jokerbalMinter.valueOf(), this.jockerPerBlock * 80 / 100);
      var pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 200);
      var userInfo = await this.lordJoker.userInfo(0, minter);
      assert.equal(userInfo.amount.valueOf(), 200);
      assert.equal(userInfo.rewardDebt.valueOf(), 200 * this.jockerPerBlock * 80 / 100 / 100);
      var balMinter = await this.pool1.balanceOf(minter);
      assert.equal(balMinter.valueOf(), 100000000 - 200);
      var balLorJoker = await this.pool1.balanceOf(this.lordJoker.address);
      assert.equal(balLorJoker.valueOf(), 200);
    });

    it('should deposit correctly when deposit 0', async() => {
      await this.lordJoker.deposit(minter, 0, '0', {from: minter});
      var jokerbalMinter = await this.joker.balanceOf(minter);
      assert.equal(jokerbalMinter.valueOf(), 0);
      var pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 0);
      var userInfo = await this.lordJoker.userInfo(0, minter);
      assert.equal(userInfo.amount.valueOf(), 0);
      assert.equal(userInfo.rewardDebt.valueOf(), 0);
      var balMinter = await this.pool1.balanceOf(minter);
      assert.equal(balMinter.valueOf(), 100000000);
      var balLorJoker = await this.pool1.balanceOf(this.lordJoker.address);
      assert.equal(balLorJoker.valueOf(), 0);
    });

    it('should deposit correctly when deposit 0 after deposit', async() => {
      await this.lordJoker.deposit(minter, 0, '100', {from: minter});
      await this.lordJoker.deposit(minter, 0, '0', {from: minter});
      var jokerbalMinter = await this.joker.balanceOf(minter);
      assert.equal(jokerbalMinter.valueOf(), this.jockerPerBlock * 80 / 100);
      var pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 100);
      var userInfo = await this.lordJoker.userInfo(0, minter);
      assert.equal(userInfo.amount.valueOf(), 100);
      assert.equal(userInfo.rewardDebt.valueOf(), 100 * this.jockerPerBlock * 80 / 100 / 100);
      var balMinter = await this.pool1.balanceOf(minter);
      assert.equal(balMinter.valueOf(), 100000000 - 100);
      var balLorJoker = await this.pool1.balanceOf(this.lordJoker.address);
      assert.equal(balLorJoker.valueOf(), 100);
    });
  });

  describe('Function withdraw check', () => {
    beforeEach(async() => {
      this.pool1 = await MockERC20.new('TOKEN1', 'TOKEN1', '100000000', { from: minter });
      await this.lordJoker.add(100, this.pool1.address, false, false, { from: owner });
      await this.pool1.approve(this.lordJoker.address, '1000', { from: minter });
      await this.lordJoker.deposit(minter, 0, '100', {from: minter});
    });

    it('should not allow to withdraw other token', async() => {
      await expectRevert(
        this.lordJoker.withdraw(minter, 0, '100', { from: owner }),
        'withdraw: caller must be _user',
      );
      await expectRevert(
        this.lordJoker.withdraw(minter, 0, '100', { from: devAddr }),
        'withdraw: caller must be _user',
      );
    });

    it('should not allow user to withdraw after set lender', async() => {
      this.lender = await MockLender.new(this.lordJoker.address, { from: owner });
      await this.lordJoker.setLender(this.lender.address, { from: owner });
      await expectRevert(
        this.lordJoker.withdraw(minter, 0, '100', {from: minter}),
        'withdraw: caller must be lender',
      );
    });

    it('should not allow user to withdraw lend pool', async() => {
      this.lender = await MockLender.new(this.lordJoker.address, { from: owner });
      await this.lordJoker.setLender(this.lender.address, { from: owner });
      this.pool2 = await MockERC20.new('TOKEN1', 'TOKEN1', '100000000', { from: minter });
      await this.lordJoker.add(100, this.pool2.address, false, true, { from: owner });
      await this.lordJoker.setLender(ZERO_ADDRESS, { from: owner });
      await expectRevert(
        this.lordJoker.withdraw(minter, 1, '100', {from: minter}),
        'withdraw: can not be lendPool',
      );
    });

    it('should not allow user to withdraw more than deposit', async() => {
      await expectRevert(
        this.lordJoker.withdraw(minter, 0, '110', {from: minter}),
        'withdraw: not good',
      );
    });
  
    it('should allow user to withdraw all correctly', async() => {
      await this.lordJoker.withdraw(minter, 0, '100', {from: minter});
      var jokerbalMinter = await this.joker.balanceOf(minter);
      assert.equal(jokerbalMinter.valueOf(), this.jockerPerBlock * 80 / 100);
      var pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 0);
      var userInfo = await this.lordJoker.userInfo(0, minter);
      assert.equal(userInfo.amount.valueOf(), 0);
      assert.equal(userInfo.rewardDebt.valueOf(), 0);
      var balMinter = await this.pool1.balanceOf(minter);
      assert.equal(balMinter.valueOf(), 100000000);
      var balLorJoker = await this.pool1.balanceOf(this.lordJoker.address);
      assert.equal(balLorJoker.valueOf(), 0);
    });

    it('should allow user to withdraw not all correctly', async() => {
      await this.lordJoker.withdraw(minter, 0, '50', {from: minter});
      var jokerbalMinter = await this.joker.balanceOf(minter);
      assert.equal(jokerbalMinter.valueOf(), this.jockerPerBlock * 80 / 100);
      var pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 50);
      var userInfo = await this.lordJoker.userInfo(0, minter);
      assert.equal(userInfo.amount.valueOf(), 50);
      assert.equal(userInfo.rewardDebt.valueOf(), 50 * this.jockerPerBlock * 80 / 100 / 100);
      var balMinter = await this.pool1.balanceOf(minter);
      assert.equal(balMinter.valueOf(), 100000000 - 50);
      var balLorJoker = await this.pool1.balanceOf(this.lordJoker.address);
      assert.equal(balLorJoker.valueOf(), 50);
    });

    it('should withdraw correctly when withdraw 0', async() => {
      await this.lordJoker.withdraw(minter, 0, '0', {from: minter});
      var jokerbalMinter = await this.joker.balanceOf(minter);
      assert.equal(jokerbalMinter.valueOf(), this.jockerPerBlock * 80 / 100);
      var pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 100);
      var userInfo = await this.lordJoker.userInfo(0, minter);
      assert.equal(userInfo.amount.valueOf(), 100);
      assert.equal(userInfo.rewardDebt.valueOf(), 100 * this.jockerPerBlock * 80 / 100 / 100);
      var balMinter = await this.pool1.balanceOf(minter);
      assert.equal(balMinter.valueOf(), 100000000 - 100);
      var balLorJoker = await this.pool1.balanceOf(this.lordJoker.address);
      assert.equal(balLorJoker.valueOf(), 100);
    });
  });

  describe('Function emergencyWithdraw check', () => {
    beforeEach(async() => {
      this.pool1 = await MockERC20.new('TOKEN1', 'TOKEN1', '100000000', { from: minter });
      await this.lordJoker.add(100, this.pool1.address, false, false, { from: owner });
      await this.pool1.approve(this.lordJoker.address, '1000', { from: minter });
      await this.lordJoker.deposit(minter, 0, '100', {from: minter});
    });

    it('should not allow to emergencyWithdraw other token', async() => {
      await expectRevert(
        this.lordJoker.emergencyWithdraw(minter, 0, { from: owner }),
        'emergencyWithdraw: caller must be _user',
      );
      await expectRevert(
        this.lordJoker.emergencyWithdraw(minter, 0, { from: devAddr }),
        'emergencyWithdraw: caller must be _user',
      );
    });

    it('should not allow user to emergencyWithdraw after set lender', async() => {
      this.lender = await MockLender.new(this.lordJoker.address, { from: owner });
      await this.lordJoker.setLender(this.lender.address, { from: owner });
      await expectRevert(
        this.lordJoker.emergencyWithdraw(minter, 0, {from: minter}),
        'emergencyWithdraw: caller must be lender',
      );
    });

    it('should not allow user to emergencyWithdraw lend pool', async() => {
      this.lender = await MockLender.new(this.lordJoker.address, { from: owner });
      await this.lordJoker.setLender(this.lender.address, { from: owner });
      this.pool2 = await MockERC20.new('TOKEN1', 'TOKEN1', '100000000', { from: minter });
      await this.lordJoker.add(100, this.pool2.address, false, true, { from: owner });
      await this.lordJoker.setLender(ZERO_ADDRESS, { from: owner });
      await expectRevert(
        this.lordJoker.emergencyWithdraw(minter, 1, {from: minter}),
        'emergencyWithdraw: can not be lendPool',
      );
    });

    it('should allow user to emergencyWithdraw correctly', async() => {
      await this.lordJoker.emergencyWithdraw(minter, 0, {from: minter});
      var jokerbalMinter = await this.joker.balanceOf(minter);
      assert.equal(jokerbalMinter.valueOf(), 0);
      var pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 0);
      var userInfo = await this.lordJoker.userInfo(0, minter);
      assert.equal(userInfo.amount.valueOf(), 0);
      assert.equal(userInfo.rewardDebt.valueOf(), 0);
      var balMinter = await this.pool1.balanceOf(minter);
      assert.equal(balMinter.valueOf(), 100000000);
      var balLorJoker = await this.pool1.balanceOf(this.lordJoker.address);
      assert.equal(balLorJoker.valueOf(), 0);
    });
  });

  describe('Function claim check', () => {
    beforeEach(async() => {
      this.pool1 = await MockERC20.new('TOKEN1', 'TOKEN1', '100000000', { from: minter });
      await this.lordJoker.add(100, this.pool1.address, false, false, { from: owner });
      await this.pool1.approve(this.lordJoker.address, '1000', { from: minter });
      await this.lordJoker.deposit(minter, 0, '100', {from: minter});
    });

    it('should claim 0 for 0 deposit user', async() => {
      await this.lordJoker.claim(0, {from: owner});
      var jokerbalowner = await this.joker.balanceOf(owner);
      assert.equal(jokerbalowner.valueOf(), 0);
      var userInfo = await this.lordJoker.userInfo(0, owner);
      assert.equal(userInfo.amount.valueOf(), 0);
      assert.equal(userInfo.rewardDebt.valueOf(), 0);
      var balowner = await this.pool1.balanceOf(owner);
      assert.equal(balowner.valueOf(), 0);
      var balLorJoker = await this.pool1.balanceOf(this.lordJoker.address);
      assert.equal(balLorJoker.valueOf(), 100);
    });

    it('should claim correctly', async() => {
      await this.lordJoker.claim(0, {from: minter});
      var pendingJocker = await this.lordJoker.pendingJocker(0, minter);
      assert.equal(pendingJocker, 0);
      var jokerbalMinter = await this.joker.balanceOf(minter);
      assert.equal(jokerbalMinter.valueOf(), this.jockerPerBlock * 80 / 100);
      var userInfo = await this.lordJoker.userInfo(0, minter);
      assert.equal(userInfo.amount.valueOf(), 100);
      assert.equal(userInfo.rewardDebt.valueOf(), 100 * this.jockerPerBlock * 80 / 100 / 100);
      var balMinter = await this.pool1.balanceOf(minter);
      assert.equal(balMinter.valueOf(), 100000000 - 100);
      var balLorJoker = await this.pool1.balanceOf(this.lordJoker.address);
      assert.equal(balLorJoker.valueOf(), 100);
    });
  });

  describe('Function depositLendPool check', () => {
    beforeEach(async() => {
      await this.lordJoker.setLender(lender, { from: owner });
      this.pool1 = await MockERC20.new('TOKEN1', 'TOKEN1', '100000000', { from: minter });
      await this.lordJoker.add(100, this.pool1.address, false, true, { from: owner });
    });

    it('should not allow all to depositLendPool before set lender', async() => {
      this.joker = await JokerToken.new({ from: owner });
      this.timelock = await Timelock.new(timelockAdmin, '172800', { from: owner });
      this.lordJoker = await LordJoker.new(this.joker.address, devAddr, this.timelock.address, this.startBlock, {from: owner});
      await this.joker.transferOwnership(this.lordJoker.address, {from : owner});
      assert.equal(await this.lordJoker.lender().valueOf(), ZERO_ADDRESS);
      await expectRevert(
        this.lordJoker.depositLendPool(owner, 0, '100', { from: owner }),
        'depositLendPool: caller must be lender',
      );
      await expectRevert(
        this.lordJoker.depositLendPool(devAddr, 0, '100', { from: devAddr }),
        'depositLendPool: caller must be lender',
      );
    });

    it('should not allow non-lender to depositLendPool after set lender', async() => {
      assert.equal(await this.lordJoker.lender().valueOf(), lender);
      await expectRevert(
        this.lordJoker.depositLendPool(owner, 0, '100', { from: owner }),
        'depositLendPool: caller must be lender',
      );
      await expectRevert(
        this.lordJoker.depositLendPool(devAddr, 0, '100', { from: devAddr }),
        'depositLendPool: caller must be lender',
      );
    });

    it('should not allow to deposit non-lend pool', async() => {
      this.pool2 = await MockERC20.new('TOKEN2', 'TOKEN2', '100000000', { from: minter });
      await this.lordJoker.add(100, this.pool2.address, false, false, { from: owner });
      await this.pool2.approve(this.lordJoker.address, '1000', { from: minter });
      await expectRevert(
        this.lordJoker.depositLendPool(minter, 1, '100', {from: lender}),
        'depositLendPool: must be lendPool',
      );
    });
  
    it('should allow lender to depositLendPool correctly', async() => {
      await this.lordJoker.depositLendPool(minter, 0, '100', {from: lender});
      var jokerbalMinter = await this.joker.balanceOf(minter);
      assert.equal(jokerbalMinter.valueOf(), 0);
      var pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 100);
      var userInfo = await this.lordJoker.userInfo(0, minter);
      assert.equal(userInfo.amount.valueOf(), 100);
      assert.equal(userInfo.rewardDebt.valueOf(), 0);

      await this.lordJoker.depositLendPool(minter, 0, '100', {from: lender});
      var jokerbalMinter = await this.joker.balanceOf(minter);
      assert.equal(jokerbalMinter.valueOf(), this.jockerPerBlock * 80 / 100);
      var pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 200);
      var userInfo = await this.lordJoker.userInfo(0, minter);
      assert.equal(userInfo.amount.valueOf(), 200);
      assert.equal(userInfo.rewardDebt.valueOf(), 200 * this.jockerPerBlock * 80 / 100 / 100);
    });

    it('should depositLendPool correctly when deposit 0', async() => {
      await this.lordJoker.depositLendPool(minter, 0, '0', {from: lender});
      var jokerbalMinter = await this.joker.balanceOf(minter);
      assert.equal(jokerbalMinter.valueOf(), 0);
      var pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 0);
      var userInfo = await this.lordJoker.userInfo(0, minter);
      assert.equal(userInfo.amount.valueOf(), 0);
      assert.equal(userInfo.rewardDebt.valueOf(), 0);
    });

    it('should deposit correctly when deposit 0 after deposit', async() => {
      await this.lordJoker.depositLendPool(minter, 0, '100', {from: lender});
      await this.lordJoker.depositLendPool(minter, 0, '0', {from: lender});
      var jokerbalMinter = await this.joker.balanceOf(minter);
      assert.equal(jokerbalMinter.valueOf(), this.jockerPerBlock * 80 / 100);
      var pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 100);
      var userInfo = await this.lordJoker.userInfo(0, minter);
      assert.equal(userInfo.amount.valueOf(), 100);
      assert.equal(userInfo.rewardDebt.valueOf(), 100 * this.jockerPerBlock * 80 / 100 / 100);
    });
  });

  describe('Function withdrawLendPool check', () => {
    beforeEach(async() => {
      await this.lordJoker.setLender(lender, { from: owner });
      this.pool1 = await MockERC20.new('TOKEN1', 'TOKEN1', '100000000', { from: minter });
      await this.lordJoker.add(100, this.pool1.address, false, true, { from: owner });
      this.lordJoker.depositLendPool(minter, 0, '100', {from: lender});
    });

    it('should not allow all to withdrawLendPool before set lender', async() => {
      this.joker = await JokerToken.new({ from: owner });
      this.timelock = await Timelock.new(timelockAdmin, '172800', { from: owner });
      this.lordJoker = await LordJoker.new(this.joker.address, devAddr, this.timelock.address, this.startBlock, {from: owner});
      await this.joker.transferOwnership(this.lordJoker.address, {from : owner});
      assert.equal(await this.lordJoker.lender().valueOf(), ZERO_ADDRESS);
      await expectRevert(
        this.lordJoker.withdrawLendPool(owner, 0, '100', { from: owner }),
        'withdrawLendPool: caller must be lender',
      );
      await expectRevert(
        this.lordJoker.withdrawLendPool(lender, 0, '100', { from: lender }),
        'withdrawLendPool: caller must be lender',
      );
    });

    it('should not allow non-lender to withdrawLendPool after set lender', async() => {
      assert.equal(await this.lordJoker.lender().valueOf(), lender);
      await expectRevert(
        this.lordJoker.withdrawLendPool(owner, 0, '100', { from: owner }),
        'withdrawLendPool: caller must be lender',
      );
      await expectRevert(
        this.lordJoker.withdrawLendPool(devAddr, 0, '100', { from: devAddr }),
        'withdrawLendPool: caller must be lender',
      );
    });

    it('should not allow to withdraw non-lend pool', async() => {
      this.pool2 = await MockERC20.new('TOKEN2', 'TOKEN2', '100000000', { from: minter });
      await this.lordJoker.add(100, this.pool2.address, false, false, { from: owner });
      await this.pool2.approve(this.lordJoker.address, '1000', { from: minter });
      await expectRevert(
        this.lordJoker.withdrawLendPool(minter, 1, '100', {from: lender}),
        'withdrawLendPool: must be lendPool',
      );
    });

    it('should not allow to withdrawLendPool more than deposit', async() => {
      await expectRevert(
        this.lordJoker.withdrawLendPool(minter, 0, '110', {from: lender}),
        'withdrawLendPool: not good',
      );
    });
  
    it('should allow lender to withdrawLendPool all correctly', async() => {
      await this.lordJoker.withdrawLendPool(minter, 0, '100', {from: lender});
      var jokerbalMinter = await this.joker.balanceOf(minter);
      assert.equal(jokerbalMinter.valueOf(), this.jockerPerBlock * 80 / 100);
      var pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 0);
      var userInfo = await this.lordJoker.userInfo(0, minter);
      assert.equal(userInfo.amount.valueOf(), 0);
      assert.equal(userInfo.rewardDebt.valueOf(), 0);
    });

    it('should allow lender to withdrawLendPool not all correctly', async() => {
      await this.lordJoker.withdrawLendPool(minter, 0, '50', {from: lender});
      var jokerbalMinter = await this.joker.balanceOf(minter);
      assert.equal(jokerbalMinter.valueOf(), this.jockerPerBlock * 80 / 100);
      var pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 50);
      var userInfo = await this.lordJoker.userInfo(0, minter);
      assert.equal(userInfo.amount.valueOf(), 50);
      assert.equal(userInfo.rewardDebt.valueOf(), 50 * this.jockerPerBlock * 80 / 100 / 100);
    });

    it('should withdrawLendPool correctly when withdraw 0', async() => {
      await this.lordJoker.withdrawLendPool(minter, 0, '0', {from: lender});
      var jokerbalMinter = await this.joker.balanceOf(minter);
      assert.equal(jokerbalMinter.valueOf(), this.jockerPerBlock * 80 / 100);
      var pool0Info = await this.lordJoker.poolInfo(0);
      assert.equal(pool0Info.totalDeposit.valueOf(), 100);
      var userInfo = await this.lordJoker.userInfo(0, minter);
      assert.equal(userInfo.amount.valueOf(), 100);
      assert.equal(userInfo.rewardDebt.valueOf(), 100 * this.jockerPerBlock * 80 / 100 / 100);
    });
  });

  describe('Function updateDev check', () => {
    it('should not allow non-dev to updateDev', async () => {
      assert.equal(await this.lordJoker.devaddr().valueOf(), devAddr);
      await expectRevert(
        this.lordJoker.updateDev(timelockAdmin, { from: minter }),
        'updateDev: wut?',
      );
      await expectRevert(
        this.lordJoker.updateDev(timelockAdmin, { from: owner }),
        'updateDev: wut?',
      );
    });

    it('should allow dev to updateDev', async () => {
      assert.equal(await this.lordJoker.devaddr().valueOf(), devAddr);
      await this.lordJoker.updateDev(timelockAdmin, { from: devAddr });
      assert.equal(await this.lordJoker.devaddr().valueOf(), timelockAdmin);
    });
  });

  describe('Function updateTreasury check', () => {
    it('should not allow non-treasury to updateTreasury', async () => {
      assert.equal(await this.lordJoker.treasury().valueOf(), this.timelock.address);
      await expectRevert(
        this.lordJoker.updateTreasury(timelockAdmin, { from: minter }),
        'updateTreasury: wut?',
      );
      await expectRevert(
        this.lordJoker.updateTreasury(timelockAdmin, { from: owner }),
        'updateTreasury: wut?',
      );
    });

    it('should allow treasury to updateTreasury', async () => {
      this.joker = await JokerToken.new({ from: owner });
      this.timelock = await Timelock.new(timelockAdmin, '172800', { from: owner });
      this.lordJoker = await LordJoker.new(this.joker.address, devAddr, timelockAdmin, this.startBlock, {from: owner});
      await this.joker.transferOwnership(this.lordJoker.address, {from : owner});
      assert.equal(await this.lordJoker.treasury().valueOf(), timelockAdmin);
      await this.lordJoker.updateTreasury(devAddr, { from: timelockAdmin });
      assert.equal(await this.lordJoker.treasury().valueOf(), devAddr);
    });
  });

  describe.skip('Halve rewards check', () => {
    it('should work correctly', async() => {
      const halveNum = this.halveNum;
      // const halveNum = 1000; // should modify HALVE_NUM to 1000 too in LordJoker.sol if you use this
      assert.ok(await web3.eth.getBlockNumber() < this.startBlock + halveNum, "Please restart the chain and try again");
      const HALVE_NUM = await this.lordJoker.HALVE_NUM();
      assert.equal(HALVE_NUM.valueOf(), halveNum, "halveNum in this file does not equal to contract HALVE_NUM");
      var lasthalveBlockNum = this.startBlock;
      const MIN_JOCKERs = await this.lordJoker.MIN_JOCKERs();

      this.pool1 = await MockERC20.new('TOKEN1', 'TOKEN1', '100000000', { from: minter });
      await this.pool1.approve(this.lordJoker.address, '1000', { from: minter });
      await this.lordJoker.add(100, this.pool1.address, false, false, { from: owner });
      await this.lordJoker.deposit(minter, 0, '100', {from: minter});
      await this.lordJoker.updatePool(0);

      var nexthalveBlockNum;
      var jockerPerBlock = this.jockerPerBlock;
      while (jockerPerBlock > MIN_JOCKERs) {
        nexthalveBlockNum = lasthalveBlockNum + halveNum;
        console.log("Current jockerPerBlock = %s, nexthalveBlockNum = %s", jockerPerBlock, nexthalveBlockNum);
        var halveBlockNum = await this.lordJoker.halveBlockNum();
        assert.equal(halveBlockNum.valueOf(), nexthalveBlockNum);
        await time.advanceBlockTo(nexthalveBlockNum);
        await this.lordJoker.updatePool(0);
        let currentRewardPerblock = await this.lordJoker.jockerPerBlock();
        assert.equal(jockerPerBlock / 2, currentRewardPerblock);
        jockerPerBlock = Number(currentRewardPerblock);
        lasthalveBlockNum = nexthalveBlockNum;
      }
      nexthalveBlockNum = nexthalveBlockNum + halveNum;
      console.log("Current jockerPerBlock = %s, nexthalveBlockNum = %s", jockerPerBlock, nexthalveBlockNum);
      await time.advanceBlockTo(nexthalveBlockNum + 1);
      await this.lordJoker.updatePool(0);
      jockerPerBlock = await this.lordJoker.jockerPerBlock();
      assert.equal(Number(jockerPerBlock), Number(MIN_JOCKERs));
      nexthalveBlockNum = nexthalveBlockNum + halveNum;
      console.log("Current jockerPerBlock = %s, nexthalveBlockNum = %s", jockerPerBlock, nexthalveBlockNum);
      await time.advanceBlockTo(nexthalveBlockNum + 1);
      await this.lordJoker.updatePool(0);
      jockerPerBlock = await this.lordJoker.jockerPerBlock();
      assert.equal(Number(jockerPerBlock), Number(MIN_JOCKERs));
      nexthalveBlockNum = nexthalveBlockNum + halveNum;
      console.log("Current jockerPerBlock = %s, nexthalveBlockNum = %s", jockerPerBlock, nexthalveBlockNum);
    });
  });
})
