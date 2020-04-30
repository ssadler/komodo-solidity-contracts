
pragma solidity >=0.4.21 <0.7.0;


contract NotarisationsV1
{
    address admin;
    address auth;
    mapping (uint256 => Notarisation) notarisations;
    uint size;
    uint lastHeight;

    struct Notarisation {
        uint hash;
        bytes extraData;
    }

    constructor(uint _size) public {
        require(size > 0, "size must be > 0");
        size = _size;
        admin = msg.sender;
    }

    function getAdmin() public view returns (address) { return admin; }
    function getAuth()  public view returns (address) { return auth; }

    function setAdmin(address _newAdmin) public onlyAdmin { admin = _newAdmin; }
    function setAuth(address _newAuth)   public onlyAdmin { auth = _newAuth; }

    function notarise(uint256 height, uint256 hash, bytes memory extraData)
                      public onlyAuth {
        notarisations[height % size] = Notarisation(hash, extraData);
    }

    function getNotarisation(uint height) public view returns (uint, uint, bytes memory)
    {
        if (height == 0) height = lastHeight;
        require(lastHeight - height < size, "That's too far, Marty!");
        Notarisation memory n = notarisations[height % size];
        if (n.hash != 0)
            return (height, n.hash, n.extraData);
        return (0, 0, "");
    }

    modifier onlyAdmin {
        require(msg.sender == admin, "not admin");
        _;
    }

    modifier onlyAuth {
        require(msg.sender == auth, "not auth");
        _;
    }
}
