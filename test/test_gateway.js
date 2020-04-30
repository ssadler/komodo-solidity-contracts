const Gateway = artifacts.require("Gateway");


contract("Gateway (construction)", accounts => {
    let members = accounts.slice(0, 3);
    members.sort();

    it('should fail if setAdmin is called by non admin', async () => {
        let auth = await Gateway.deployed();
        await assertFail("not admin", 
            auth.setAdmin(accounts[1], {from: accounts[1]})
        );
    });
});


contract("Gateway (members)", accounts => {
    let members = accounts.slice(0, 3);
    members.sort();

    /*
     * Test contract creation and setting members
     */

    it("should construct with no members", async () => {
        let auth = await Gateway.deployed();
        let r = await auth.getMembers();

        assert.equal(r['1'].length, 0);
        assert(web3.utils.toBN(0).eq(r['0']), "requiredSigs different");
    });

    it("should create members with setMembers", async () => {
        let auth = await Gateway.deployed();
        await auth.setMembers(2, members);
        let r = await auth.getMembers();
        assert.equal(r['1'].length, members.length);
        for (let i=0; i<r['1'].length; i++)
            assert.equal(members[i], r['1'][i]);
        assert(web3.utils.toBN(2).eq(r['0']), "requiredSigs different");
    });

    it("should fail if member keys are not sorted", async () => {
        let auth = await Gateway.deployed();
        await assertFail("member keys must be sorted", 
            auth.setMembers(2, [members[1], members[0]])
        );
    });

    it('should fail if setMembers is called by non admin', async () => {
        let auth = await Gateway.deployed();
        await assertFail("not admin", 
            auth.setMembers(1, members, {from: accounts[1]})
        );
    });

    it("Correctly checks membership", async () => {
        let auth = await Gateway.new();
        for (var i=0; i<accounts.length-1; i++) {
            let mx = accounts.slice(0, i);
            mx.sort();
            await auth.setMembers(0, mx);

            for (var j=0; j<=i; j++) {
                assert.equal(j<mx.length, await auth.isMember(accounts[j]));
            }
        }
    });
});


contract("Gateway (configs)", accounts => {
    let members = accounts.slice(0, 3);
    members.sort();

    it("Correctly sets a config", async () => {
        let auth = await Gateway.new();
        assert.equal(null, await auth.getConfig("a"));
        await auth.setConfig("a", "0xff");
        assert.equal("0xff", await auth.getConfig("a"));
    })

    it("Correctly deletes a config", async () => {
        let auth = await Gateway.new();
        await auth.setConfig("a", "0xff");
        await auth.setConfig("a", "0x");
        assert.equal(null, await auth.getConfig("a"));
    })
});


contract("Gateway (proxy)", accounts => {
    let members = accounts.slice(0, 3);
    members.sort();

    let zz = "0x0000000000000000000000000000000000000000000000000000000000000000";
    
    it('fail if not enough sigs', async () => {
        let auth = await Gateway.new();
        await auth.setMembers(2, members);
        await assertFail("not enough sigs", 
            auth.proxy(accounts[2], "0x00", [zz], [zz], [0])
        );
    });

    it('fail if arrays mismatched', async () => {
        let auth = await Gateway.new();
        await auth.setMembers(1, members);
        await assertFail("arrays mismatched", 
            auth.proxy(accounts[2], "0x00", [zz], [zz, zz], [0, 0])
        );
        await assertFail("arrays mismatched", 
            auth.proxy(accounts[2], "0x00", [zz, zz], [zz], [0, 0])
        );
        await assertFail("arrays mismatched", 
            auth.proxy(accounts[2], "0x00", [zz, zz], [zz, zz], [0])
        );
    });

    /*
     * Generic method for testing the proxy
     */
    let callProxy = async args => {
        if (!args) args = {};
        let g = (x, y) => typeof x == 'undefined' ? y : x;
        let auth = args.auth || await Gateway.new();
        await auth.setMembers(g(args.m, 2), g(args.members, members));

        let callData = g(args.callData, web3.eth.abi.encodeFunctionSignature('getAdmin()'));

        let nonce = g(args.nonce, await auth.getProxyNonce());
        let msg = web3.utils.soliditySha3(nonce, auth.address, callData);

        let r = [];
        let s = [];
        let v = [];

        let signers = g(args.signers, members.slice(0, 2));
        for (let i=0; i<signers.length; i++)
            await signParts(msg, signers[i], r, s, v);

        let from = {from: args.from || accounts[0]};

        return args.call ?
            auth.proxy.call(auth.address, callData, r, s, v, from) :
            auth.proxy(auth.address, callData, r, s, v, from);
    }

    it('fail if proxy is called by non member', async () => {
        let auth = await Gateway.new();
        await auth.setMembers(2, members);
        await assertFail("not member", 
            auth.proxy(accounts[2], "0x00", [], [], [], {from: accounts[6]})
        );
    });

    it('succeed if properly signed', async () => {
        let res = await callProxy({call: 1});
        assert(res['0'], "proxy call failed");
        assert.equal(
            accounts[0],
            web3.eth.abi.decodeParameter('address', res['1']),
            "unexpected return data");
    });

    it("increment nonce", async () => {
        let auth = await Gateway.new();
        assert.equal(await auth.getProxyNonce(), 0);
        await callProxy({auth});
        assert.equal(await auth.getProxyNonce(), 1);
        await callProxy({auth});
        assert.equal(await auth.getProxyNonce(), 2);
        await callProxy();  // check assumptions
        assert.equal(await auth.getProxyNonce(), 2);
    });

    it("fail with 0 members", async () => {
        await assertFail("not member", callProxy({ members: [] }));
    });

    it('fail if proxy is called by non member', async () => {
        await assertFail("not member", callProxy({ from: accounts[6] }));
    });

    /* 
     * Since many of the failure causes in Proxy will result in the same error,
     * it's important to have a single function to construct the test case
     * and serve as a control.
     */
    let controlProxyFailure = async (control, fail) => {
        // Control case passes
        await callProxy(control);
        await assertFail("wrong sig or not sorted by address", callProxy(fail));
    }

    it("fail if sigs are ok but out of order", async () => {
        controlProxyFailure(
            { signers: [members[0], members[1]] },
            { signers: [members[1], members[0]] });
    });

    it("fail if many sigs are the same", async () => {
        controlProxyFailure(
            { signers: [members[0], members[1]] },
            { signers: [members[0], members[0]] });
    });

    it('fail if nonce is wrong', async () => {
        controlProxyFailure(
            { nonce: 0},
            { nonce: 1});
    });
});


let signParts = async (msg, addr, r, s, v) => {
    let sig = await web3.eth.sign(msg, addr);
    assert.equal(web3.eth.accounts.recover(msg, sig, false), addr, 'recover failed');

    r.push(sig.substr(0, 66));
    s.push("0x" + sig.substr(66,64));
    v.push(sig.substr(131) == '1' ? 28 : 27);
};

let assertFail = async (reason, p) => {
    // if you get a "hijackedStack" error, or the error object has no 'reason'
    // member, maybe you're using `method.call` and you should just use `method`.
    try {
        assert.fail(await p);
    } catch (error) {
        assert.equal(error.reason, reason);
    }
};
