pragma solidity 0.6.12;

interface ILordJokerVaults {
    function transferTokenToVaults(uint256 _pid, uint256 _amount) external;
}

contract MockVaults {
    ILordJokerVaults lordjoker;
    
    constructor (address _lordjoker) public {
        lordjoker = ILordJokerVaults(_lordjoker);
    }
    
    // Just for test
    function getToken(uint256 _pid, uint256 _amount) public {
        lordjoker.transferTokenToVaults(_pid, _amount);
    }
}