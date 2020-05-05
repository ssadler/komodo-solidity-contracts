const Gateway = artifacts.require("Gateway");
const Notarisations = artifacts.require("Notarisations");


module.exports = async function(deployer, network, accounts) {
    await deployer.deploy(Gateway);
    let gateway = await Gateway.deployed();

    let testAccount = '0xf1b0d134f6c9ef6b2f332517273e9c14058acc89';
    await gateway.setMembers(1, [testAccount]);
    let r = await web3.eth.sendTransaction({from: accounts[0], to: testAccount, value: web3.utils.toWei('1')});

    await deployer.deploy(Notarisations, 100);
    let kmd = await Notarisations.deployed();
    await kmd.setGateway(gateway.address);

    // Set config for eth kmd notarisations gateway
    let kmdeth = { notarisationsContract: kmd.address };
    await gateway.setConfig("KMDETH", web3.utils.toHex(JSON.stringify(kmdeth)));
};
