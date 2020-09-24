pragma solidity 0.6.12;

interface ILordJokerLender {
    function lendToken(address _user, uint256 _pid, uint256 _amount) external;
}

contract MockLender {
    ILordJokerLender public lordjoker;
    
    constructor (address _lordjoker) public {
        lordjoker = ILordJokerLender(_lordjoker);
    }
    
    // Just for test
    function lend(address _user, uint256 _pid, uint256 _amount) public {
        lordjoker.lendToken(_user, _pid, _amount);
    }
}