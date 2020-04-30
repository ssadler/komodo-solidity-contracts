const Gateway = artifacts.require("Gateway");
const Notarisations = artifacts.require("Notarisations");


module.exports = async function(deployer, network, accounts) {
    await deployer.deploy(Gateway);
    let gateway = await Gateway.deployed();
    gateway.setMembers(1, [accounts[0]]);

    await deployer.deploy(Notarisations, 100);
    let kmd = await Notarisations.deployed();
    await kmd.setGateway(gateway.address);

    await gateway.setConfig("KMD notarisations", kmd.address);
};
