pragma solidity 0.6.12;


import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./JokerToken.sol";


interface IMigratorChef {
    // Perform LP token migration from legacy UniswapV2 to SushiSwap.
    // Take the current LP token address and return the new LP token address.
    // Migrator should have full access to the caller's LP token.
    // Return the new LP token address.
    //
    // XXX Migrator must have allowance access to UniswapV2 LP tokens.
    // SushiSwap must mint EXACTLY the same amount of SushiSwap LP tokens or
    // else something bad will happen. Traditional UniswapV2 does not
    // do that so be careful!
    function migrate(IERC20 token) external returns (IERC20);
}

// LordJoker is the master of Joker. He can make JOKER and he is a fair guy.
//
// Note that it's ownable and the owner wields tremendous power. The ownership
// will be transferred to a governance smart contract once JOCKER is sufficiently
// distributed and the community can show to govern itself.
//
// Have fun reading it. Hopefully it's bug-free. God bless.
contract LordJoker is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Info of each user.
    struct UserInfo {
        uint256 amount;     // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of JOCKERs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accJockerPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accJockerPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each pool.
    struct PoolInfo {
        bool lendPool;              // Whether is lending pool.
        IERC20 lpToken;             // Address of LP token contract.
        uint256 allocPoint;         // How many allocation points assigned to this pool. JOCKERs to distribute per block.
        uint256 lastRewardBlock;    // Last block number that JOCKERs distribution occurs.
        uint256 accJockerPerShare;  // Accumulated JOCKERs per share, times 1e12. See below.
        uint256 totalDeposit;       // Accumulated deposit tokens.
        // uint256 totalLend;          // Accumulated lent tokens.
    }

    // The JOCKER TOKEN!
    JokerToken public jocker;
    // Dev address.
    address public devaddr;
    // Treasury address.
    address public treasury;
    // Block number when bonus JOCKER period ends.
    // uint256 public bonusEndBlock;
    // JOCKER tokens created per block.
    uint256 public jockerPerBlock = 80 * 1e18;
    // Min rewards per block.
    uint256 public constant MIN_JOCKERs = 5 * 1e18;
    // Max supply 100m
    uint256 public constant MAX_SUPPLY = 100000000 * 1e18;
    // Bonus muliplier for early jocker makers.
    // uint256 public constant BONUS_MULTIPLIER = 10;
    // Half ervry blocks
    uint256 public constant HALVE_NUM = 200000;
    // Block number when half happens
    uint256 public halveBlockNum;
    // The migrator contract. It has a lot of power. Can only be set through governance (owner).
    IMigratorChef public migrator;
    // The lender contract. It can modify lendPool derectly. Can only be set through governance (owner).
    address public lender;
    // The vaults contract. It can transfer token derectly. Can only be set through governance (owner).
    address public vaults;
    
    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping (uint256 => mapping (address => UserInfo)) public userInfo;
    // Total allocation poitns. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    // The block number when JOCKER mining starts.
    uint256 public startBlock;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event ClaimRewards(address indexed user, uint256 indexed pid, uint256 amount);
    event HalveRewards(uint256 indexed before, uint256 afther);

    constructor(
        JokerToken _joker,
        address _devaddr,
        address _treasury,
        // uint256 _jockerPerBlock,
        uint256 _startBlock
        // uint256 _bonusEndBlock
    ) public {
        jocker = _joker;
        devaddr = _devaddr;
        treasury = _treasury;
        // jockerPerBlock = _jockerPerBlock;
        // bonusEndBlock = _bonusEndBlock;
        startBlock = _startBlock;
        halveBlockNum = _startBlock.add(HALVE_NUM);
    }

    modifier checkHalve() {
        if (block.number >= halveBlockNum && jockerPerBlock > MIN_JOCKERs) {
            uint256 before = jockerPerBlock;
            jockerPerBlock = jockerPerBlock.mul(50).div(100);
            halveBlockNum = halveBlockNum.add(HALVE_NUM);
            emit HalveRewards(before, jockerPerBlock);
        }
        _;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(uint256 _allocPoint, IERC20 _lpToken, bool _withUpdate, bool _lendPool) public onlyOwner {
        if (_lendPool) {
            require(address(0) != lender, "add: no lender");
        }
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolInfo.push(PoolInfo({
            lendPool: _lendPool,
            lpToken: _lpToken,
            allocPoint: _allocPoint,
            lastRewardBlock: lastRewardBlock,
            accJockerPerShare: 0,
            totalDeposit: 0
            // totalLend: 0
        }));
    }

    // Update the given pool's JOCKER allocation point. Can only be called by the owner.
    function set(uint256 _pid, uint256 _allocPoint, bool _withUpdate) public onlyOwner {
        // !!!When change pool weight without massUpdatePools, will mint more or less jockerReward
        if (_withUpdate) {
            massUpdatePools();
        }
        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(_allocPoint);
        poolInfo[_pid].allocPoint = _allocPoint;
    }

    // Transfer token contract owner. Can only be called by the owner.
    function transferTokenOwner(address _owner) public onlyOwner {
        jocker.transferOwnership(_owner);
    }

    // Set the migrator contract. Can only be called by the owner.
    function setMigrator(IMigratorChef _migrator) public onlyOwner {
        migrator = _migrator;
    }

    // Set the lender contract. Can only be called by the owner.
    function setLender(address _lender) public onlyOwner {
        lender = _lender;
    }

    // Set the vaults contract. Can only be called by the owner.
    function setVaults(address _vaults) public onlyOwner {
        vaults = _vaults;
    }

    // Migrate lp token to another lp contract. Can be called by anyone. We trust that migrator contract is good.
    function migrate(uint256 _pid) public {
        require(address(migrator) != address(0), "migrate: no migrator");
        PoolInfo storage pool = poolInfo[_pid];
        IERC20 lpToken = pool.lpToken;
        uint256 bal = lpToken.balanceOf(address(this));
        lpToken.safeApprove(address(migrator), bal);
        IERC20 newLpToken = migrator.migrate(lpToken);
        require(bal == newLpToken.balanceOf(address(this)), "migrate: bad");
        pool.lpToken = newLpToken;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to) public pure returns (uint256) {
        // if (_to <= bonusEndBlock) {
        //     return _to.sub(_from).mul(BONUS_MULTIPLIER);
        // } else if (_from >= bonusEndBlock) {
        //     return _to.sub(_from);
        // } else {
        //     return bonusEndBlock.sub(_from).mul(BONUS_MULTIPLIER).add(
        //         _to.sub(bonusEndBlock)
        //     );
        // }
        return _to.sub(_from);
    }

    // View function to see pending JOCKERs on frontend.
    function pendingJocker(uint256 _pid, address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accJockerPerShare = pool.accJockerPerShare;
        if (block.number > pool.lastRewardBlock && pool.totalDeposit != 0) {
            uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
            uint256 jockerReward = multiplier.mul(jockerPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
            uint256 devReward = jockerReward.div(10);
            uint256 treasuryReward = jockerReward.div(10);
            uint256 poolReward = jockerReward.sub(devReward).sub(treasuryReward);
            accJockerPerShare = accJockerPerShare.add(poolReward.mul(1e12).div(pool.totalDeposit));
        }
        return user.amount.mul(accJockerPerShare).div(1e12).sub(user.rewardDebt);
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public checkHalve {
        uint256 totalSupply = jocker.totalSupply();
        if (totalSupply >= MAX_SUPPLY) {
            return;
        }
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        if (pool.totalDeposit == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 jockerReward = multiplier.mul(jockerPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
        // !!!When change pool weight without massUpdatePools, will mint more or less jockerReward
        uint256 devReward = jockerReward.div(10);
        uint256 treasuryReward = jockerReward.div(10);
        uint256 poolReward = jockerReward.sub(devReward).sub(treasuryReward);
        jocker.mint(devaddr, devReward);
        jocker.mint(treasury, treasuryReward);
        jocker.mint(address(this), poolReward);
        pool.accJockerPerShare = pool.accJockerPerShare.add(poolReward.mul(1e12).div(pool.totalDeposit));
        pool.lastRewardBlock = block.number;
    }

    // Deposit LP tokens to LordJoker for JOCKER allocation.
    function deposit(address _user, uint256 _pid, uint256 _amount) public {
        if(lender != address(0)) {
            require(msg.sender == lender, "deposit: caller must be lender");
        } else {
            require(msg.sender == _user, "deposit: caller must be _user");
        }
        PoolInfo storage pool = poolInfo[_pid];
        require(!pool.lendPool, "deposit: can not be lendPool");
        UserInfo storage user = userInfo[_pid][_user];
        updatePool(_pid);
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(pool.accJockerPerShare).div(1e12).sub(user.rewardDebt);
            if(pending > 0) {
                safeJockerTransfer(_user, pending);
            }
        }
        if(_amount > 0) {
            pool.lpToken.safeTransferFrom(address(_user), address(this), _amount);
            user.amount = user.amount.add(_amount);
            pool.totalDeposit = pool.totalDeposit.add(_amount);
        }
        user.rewardDebt = user.amount.mul(pool.accJockerPerShare).div(1e12);
        emit Deposit(_user, _pid, _amount);
    }

    // Withdraw LP tokens from LordJoker.
    function withdraw(address _user, uint256 _pid, uint256 _amount) public {
        if(lender != address(0)) {
            require(msg.sender == lender, "withdraw: caller must be lender");
        } else {
            require(msg.sender == _user, "withdraw: caller must be _user");
        }
        PoolInfo storage pool = poolInfo[_pid];
        require(!pool.lendPool, "withdraw: can not be lendPool");
        UserInfo storage user = userInfo[_pid][_user];
        require(user.amount >= _amount, "withdraw: not good");
        updatePool(_pid);
        uint256 pending = user.amount.mul(pool.accJockerPerShare).div(1e12).sub(user.rewardDebt);
        if(pending > 0) {
            safeJockerTransfer(_user, pending);
        }
        if(_amount > 0) {
            user.amount = user.amount.sub(_amount);
            pool.totalDeposit = pool.totalDeposit.sub(_amount);
            pool.lpToken.safeTransfer(address(_user), _amount);
        }
        user.rewardDebt = user.amount.mul(pool.accJockerPerShare).div(1e12);
        emit Withdraw(_user, _pid, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(address _user, uint256 _pid) public {
        if(lender != address(0)) {
            require(msg.sender == lender, "emergencyWithdraw: caller must be lender");
        } else {
            require(msg.sender == _user, "emergencyWithdraw: caller must be _user");
        }
        PoolInfo storage pool = poolInfo[_pid];
        require(!pool.lendPool, "emergencyWithdraw: can not be lendPool");
        UserInfo storage user = userInfo[_pid][_user];
        uint256 amount = user.amount;
        user.amount = 0;
        user.rewardDebt = 0;
        pool.totalDeposit = pool.totalDeposit.sub(amount);
        pool.lpToken.safeTransfer(address(_user), amount);
        emit EmergencyWithdraw(_user, _pid, amount);
    }

    // Claim JOCKER allocation rewards.
    function claim(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        uint256 pending = 0;
        if (user.amount > 0) {
            pending = user.amount.mul(pool.accJockerPerShare).div(1e12).sub(user.rewardDebt);
            if(pending > 0) {
                safeJockerTransfer(msg.sender, pending);
            }
        }
        user.rewardDebt = user.amount.mul(pool.accJockerPerShare).div(1e12);
        emit ClaimRewards(msg.sender, _pid, pending);
    }

    // Claim all JOCKER allocation rewards. Be careful of gas spending!
    function claimAll() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            UserInfo storage user = userInfo[pid][msg.sender];
            if (user.amount > 0) {
                claim(pid);
            }
        }
    }

    // Increase user lendPool deposit amount for JOCKER allocation.
    function depositLendPool(address _user, uint256 _pid, uint256 _amount) external {
        require(msg.sender == lender, "depositLendPool: caller must be lender");
        PoolInfo storage pool = poolInfo[_pid];
        require(pool.lendPool, "depositLendPool: must be lendPool");
        UserInfo storage user = userInfo[_pid][_user];
        updatePool(_pid);
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(pool.accJockerPerShare).div(1e12).sub(user.rewardDebt);
            if(pending > 0) {
                safeJockerTransfer(_user, pending);
            }
        }
        if(_amount > 0) {
            user.amount = user.amount.add(_amount);
            pool.totalDeposit = pool.totalDeposit.add(_amount);
        }
        user.rewardDebt = user.amount.mul(pool.accJockerPerShare).div(1e12);
        emit Deposit(_user, _pid, _amount);
    }

    // Decrease user lendPool deposit amount for JOCKER allocation.
    function withdrawLendPool(address _user, uint256 _pid, uint256 _amount) external {
        require(msg.sender == lender, "withdrawLendPool: caller must be lender");
        PoolInfo storage pool = poolInfo[_pid];
        require(pool.lendPool, "withdrawLendPool: must be lendPool");
        UserInfo storage user = userInfo[_pid][_user];
        require(user.amount >= _amount, "withdrawLendPool: not good");
        updatePool(_pid);
        uint256 pending = user.amount.mul(pool.accJockerPerShare).div(1e12).sub(user.rewardDebt);
        if(pending > 0) {
            safeJockerTransfer(_user, pending);
        }
        if(_amount > 0) {
            user.amount = user.amount.sub(_amount);
            pool.totalDeposit = pool.totalDeposit.sub(_amount);
        }
        user.rewardDebt = user.amount.mul(pool.accJockerPerShare).div(1e12);
        emit Withdraw(_user, _pid, _amount);
    }

    // Lend token to user, only called by lender. Be careful of cashability!!
    function lendToken(address _user, uint256 _pid, uint256 _amount) external {
        require(address(0) != lender, "lendToken: no lender");
        require(msg.sender == lender, "lendToken: caller must be lender");
        require(address(0) != _user, "lendToken: can not lend to 0");
        if(_amount > 0) {
            PoolInfo storage pool = poolInfo[_pid];
            pool.lpToken.safeTransfer(address(_user), _amount);  // XXX Must make sure have enough balance.
            // pool.totalLend = pool.totalLend.add(_amount);
        }
    }

    // Vault token to other pool, only called by vaults.
    function transferTokenToVaults(uint256 _pid, uint256 _amount) external {
        require(address(0) != vaults, "transferTokenToVaults: no vaults");
        require(msg.sender == vaults, "transferTokenToVaults: caller must be vaults");
        if(_amount > 0) {
            PoolInfo storage pool = poolInfo[_pid];
            pool.lpToken.safeTransfer(address(vaults), _amount);  // XXX Must make sure have enough balance.
        }
    }

    // Safe jocker transfer function, just in case if rounding error causes pool to not have enough JOCKERs.
    function safeJockerTransfer(address _to, uint256 _amount) internal {
        uint256 jockerBal = jocker.balanceOf(address(this));
        if (_amount > jockerBal) {
            jocker.transfer(_to, jockerBal);
        } else {
            jocker.transfer(_to, _amount);
        }
    }

    // Update dev address by the previous dev.
    function updateDev(address _devaddr) public {
        require(msg.sender == devaddr, "updateDev: wut?");
        devaddr = _devaddr;
    }
    
    // Update treasury address by the previous treasury.
    function updateTreasury(address _treasury) public {
        require(msg.sender == treasury, "updateTreasury: wut?");
        treasury = _treasury;
    }
}
