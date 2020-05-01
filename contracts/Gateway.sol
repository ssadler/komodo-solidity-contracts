
/*
 * Komodo Gateway contract
 *
 * 2020 Scott Sadler
 * 
 * This contract is designed to act as a multisig proxy so that a consortium
 * can coordinate to perform actions on the Ethereum blockchain.
 * 
 * It includes a members list, a threshold proxying function, and a key/value map for
 * configurations.
 *
 */

pragma solidity >=0.4.21 <0.7.0;


contract Gateway {

    address admin;
    uint requiredSigs;
    uint membersLength;
    address startAddress = maxAddress;
    mapping (address => address) members;
    mapping (string => bytes) configs;
    mapping (address => uint256) nonceMap;

    address constant maxAddress = 0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF;

    constructor() public { admin = msg.sender; }

    function getAdmin() public view returns (address) { return admin; }

    function setAdmin(address _newAdmin) public onlyAdmin { admin = _newAdmin; }
    
    function getMembers() public view returns (uint, address[] memory) {
        address[] memory ms = new address[](membersLength);
        uint i=0;
        for (address cur = startAddress; cur != maxAddress; cur = members[cur])
            ms[i++] = cur;
        return (requiredSigs, ms);
    }

    /*
     * Set member addresses and threshold.
     * If members are set to empty, or requiredSigs is too high, or zero,
     * proxy will be impossible.
     */
    function setMembers(uint8 _requiredSigs, address[] memory _addrs) public onlyAdmin
    {
        requiredSigs = _requiredSigs;
        membersLength = _addrs.length;

        /// Linked list update is a little complex
        /// but has best cost efficiency and fast lookups.

        address cur = startAddress;
        startAddress = _addrs.length == 0 ? maxAddress : _addrs[0];
        for (uint i=0; i<=_addrs.length; i++) {
            address m = i == _addrs.length ? maxAddress : _addrs[i];
            while (m > cur) {
                address s = cur;
                cur = members[cur];
                delete members[s];
            }
            address oldcur = cur;
            if (m == cur) cur = members[cur];

            if (i < _addrs.length) {
                address m1 = i == _addrs.length-1 ? maxAddress : _addrs[i+1];
                require(m < m1, "members must be sorted");
                if (m != oldcur || m1 != members[oldcur])
                    members[m] = m1;
            }
        }
    }

    function getConfig(string memory _key) public view returns (bytes memory) { return configs[_key]; }
    
    function setConfig(string memory _key, bytes memory _val) public onlyAdmin {
        if (_val.length == 0)
            delete configs[_key];
        else
            configs[_key] = _val;
    }
    
    function getNonce(address _key) public view returns (uint256) { return nonceMap[_key]; }
    
    /*
     * Call with member sigs (split into r, s, v) sorted by address and if valid and
     * the threshold will proxy call to given target address
     * 
     * The nonce should be specific to the target, and must increase on each call for each
     * target. It can increase by any amount, it does not need to increase by just 1.
     */
    function proxy(address _target, uint _nonce, bytes memory _callData,
                   bytes32[] memory _vr, bytes32[] memory _vs, uint8[] memory _vv)
                   public onlyMember
                   returns (bool, bytes memory)
    {
        require(requiredSigs > 0, "disabled");
        require(_vv.length >= requiredSigs, "not enough sigs");
        require(_vv.length == _vs.length && _vv.length == _vr.length, "arrays mismatched");

        require(_nonce > nonceMap[_target], "nonce is low");
        nonceMap[_target] = _nonce;

        bytes32 sighash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encodePacked(address(this), _nonce, _target, _callData))));

        address last;
        
        for (uint i=0; i<_vv.length; i++) {
            address r = ecrecover(sighash, _vv[i], _vr[i], _vs[i]);
            require(r > last && isMember(r), "wrong sig or not sorted by address");
            last = r;
        }
        
        return _target.call(_callData);
    }

    function isMember(address addr) public view returns (bool)
    {
        return members[addr] != address(0);
    }

    modifier onlyMember {
        require(isMember(msg.sender), "not member");

        _;
    }

    modifier onlyAdmin {
        require(msg.sender == admin, "not admin");

        _;
    }
}
