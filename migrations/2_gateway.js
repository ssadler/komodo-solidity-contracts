const Gateway = artifacts.require("Gateway");
const Notarisations = artifacts.require("Notarisations");


module.exports = async function(deployer, network, accounts) {
    await deployer.deploy(Gateway);
    let gateway = await Gateway.deployed();

    await deployer.deploy(Notarisations, 100);
    let kmd = await Notarisations.deployed();
    await kmd.setGateway(gateway.address);

    let testAccounts = [
        '0x22d491bde2303f2f43325b2108d26f1eaba1e32b',
        '0x90f8bf6a479f320ead074411a4b0e7944ea8c9c1',
        '0xe11ba2b4d45eaed5996cd0823791e0c93114882d',
        '0xffcf8fdee72ac11b5c542428b35eef5769c409f0',
    ].sort();

    await gateway.setMembers(2, testAccounts);
    for (let i=0; i<testAccounts.length; i++) {
        await web3.eth.sendTransaction({
            from: accounts[0], to: testAccounts[i], value: web3.utils.toWei('0.1')
        });
    }

    console.log("configuring ropsten");
    let kmdeth = {
        notarisationsContract: kmd.address,
        kmdChainSymbol: "TXSCLZDEV",
        kmdNotarySigs: 2,
        kmdBlockInterval: 3,
        consensusTimeout: 10 * 1000000,
        ethChainId: 1,
        ethNotariseGas: 500000
    };
    await gateway.setConfig("KMDETH", web3.utils.toHex(JSON.stringify(kmdeth)));
};
