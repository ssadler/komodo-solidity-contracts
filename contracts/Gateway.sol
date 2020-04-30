
/*
 * Komodo Gateway contract
 *
 * 2020 Scott Sadler
 * 
 * This contract is designed to act as a multisig proxy so that a consortium
 * can perform transactions on the Ethereum blockchain. It has the following
 * features:
 *
 * 1. Proxy calls to another contract when signed by at least m of n members
 * 2. Store configs of data to be able to update member directives / config on the go
 *
 */

pragma solidity >=0.4.21 <0.7.0;


contract Gateway {

    /*
     * Admin address
     */
    address admin;

    /*
     * Sorted list of members
     */
    address[] members;

    /*
     * Number of member signatures required to proxy a call
     */
    uint requiredSigs;

    /*
     * A place to store directives
     */
    mapping (string => bytes) configs;

    /*
     * A nonce for proxy calls so they cannot be repeated
     */
    mapping (address => uint256) nonceMap;

    constructor() public { admin = msg.sender; }

    function getAdmin() public view returns (address) { return admin; }

    function setAdmin(address _newAdmin) public onlyAdmin { admin = _newAdmin; }

    function getMembers() public view returns (uint, address[] memory) { return (requiredSigs, members); }

    /*
     * Set member addresses and threshold. Addresses must be sorted.
     * If members are set to empty, or requiredSigs is too high, proxy will be impossible.
     */
    function setMembers(uint8 _requiredSigs, address[] memory _members) public onlyAdmin
    {
        requiredSigs = _requiredSigs;

        if (_members.length > 1)
            for (uint i=0; i<_members.length-1; i++)
                require(_members[i] < _members[i+1], "member keys must be sorted");

        members = _members;
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
     */
    function proxy(address _target, uint _nonce, bytes memory _callData,
                   bytes32[] memory _vr, bytes32[] memory _vs, uint8[] memory _vv)
                   public onlyMember
                   returns (bool, bytes memory)
    {
        uint nMembers = members.length;
        require(nMembers > 0, "no members");
        require(_vv.length >= requiredSigs, "not enough sigs");
        require(_vv.length == _vs.length && _vv.length == _vr.length, "arrays mismatched");

        require(_nonce > nonceMap[_target], "nonce is low");
        nonceMap[_target] = _nonce;

        bytes32 sighash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encodePacked(address(this), _nonce, _target, _callData))));

        {
            uint memberIdx = 0;
            
            for (uint i=0; i<_vv.length; i++) {
                address addr = ecrecover(sighash, _vv[i], _vr[i], _vs[i]);
                while (true) {
                    require(memberIdx < nMembers, "wrong sig or not sorted by address");
                    if (addr == members[memberIdx++]) break;
                }
            }
        }
        
        return _target.call(_callData);
    }

    function isMember(address subject) public view returns (bool)
    {
        /// Binary search is much cheaper than scan because I/O is very expensive

        uint lo = 0;
        uint hi = members.length;
        if (hi == 0) return false;
        hi -= 1;

        while (true) {
            uint mid = (lo + hi) >> 1;
            address midmember = members[mid];
            if (subject > midmember) {
                if (mid == hi) return false;
                lo = mid + 1;
            } else if (subject < midmember) {
                if (mid == 0) return false;
                hi = mid - 1;
            } else {
                return true;
            }
        }
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
