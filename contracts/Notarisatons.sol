
pragma solidity >=0.4.21 <0.7.0;


contract Notarisations
{
    address admin;
    address gateway;
    mapping (uint => Notarisation) notarisations;
    uint size;
    uint sequence;

    struct Notarisation {
        uint height;
        bytes32 hash;
        uint ourHeight;
        bytes extraData;
    }

    constructor(uint _size) public {
        require(_size > 0, "size must be > 0");
        size = _size;
        admin = msg.sender;
    }

    function getAdmin() public view returns (address) { return admin; }
    function getGateway() public view returns (address) { return gateway; }

    function setAdmin(address _newAdmin) public onlyAdmin { admin = _newAdmin; }
    function setGateway(address _newGateway) public onlyAdmin { gateway = _newGateway; }

    function notarise(uint height, bytes32 hash, bytes memory extraData)
                      public onlyGateway
    {
        sequence++;
        notarisations[sequence % size] = Notarisation(height, hash, block.number, extraData);
    }

    function getLastNotarisation() public view returns (uint, bytes32, uint, bytes memory)
    {
        Notarisation memory n = notarisations[sequence % size];
        return (n.height, n.hash, n.ourHeight, n.extraData);
    }

    modifier onlyAdmin {
        require(msg.sender == admin, "not admin");
        _;
    }

    modifier onlyGateway {
        require(msg.sender == gateway, "not gateway");
        _;
    }
}
