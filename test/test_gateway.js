const Gateway = artifacts.require("Gateway");


contract("Gateway", accounts => {
    let members = accounts.slice(0, 3);
    members.sort();


    describe("construction", async () => {
        it('should fail if setAdmin is called by non admin', async () => {
            let auth = await Gateway.new();
            await assertFail("not admin", 
                auth.setAdmin(accounts[1], {from: accounts[1]})
            );
        });
    });


    describe("members", async () => {

        /*
         * Test contract creation and setting members
         */

        it("should construct with no members", async () => {
            let auth = await Gateway.new();
            let r = await auth.getMembers();

            assert.equal(r['1'].length, 0);
            assert(web3.utils.toBN(0).eq(r['0']), "requiredSigs different");
        });

        it("should create members with setMembers", async () => {
            let auth = await Gateway.new();
            await auth.setMembers(2, members);
            let r = await auth.getMembers();
            assert.equal(r['1'].length, members.length);
            for (let i=0; i<r['1'].length; i++)
                assert.equal(members[i], r['1'][i]);
            assert(web3.utils.toBN(2).eq(r['0']), "requiredSigs different");
        });

        it("should fail if member keys are not sorted", async () => {
            let auth = await Gateway.new();
            await assertFail("members must be sorted", 
                auth.setMembers(2, [members[1], members[0]])
            );
        });

        it('should fail if setMembers is called by non admin', async () => {
            let auth = await Gateway.new();
            await assertFail("not admin", 
                auth.setMembers(1, members, {from: accounts[1]})
            );
        });

        it("Correctly checks membership", async () => {
            let auth = await Gateway.new();
            let check = async ms => {
                ms.sort();
                await auth.setMembers(0, ms);
                for (var i=0; i<accounts.length; i++) {
                    assert.equal(ms.includes(accounts[i]), await auth.isMember(accounts[i]));
                }
                let r = await auth.getMembers();
                assert.equal(r['0'], 0);
                for (let i=0; i<ms.length; i++) assert.equal(ms[i], r['1'][i]);
            }
            await check([accounts[0], accounts[2], accounts[4]]);
            await check([accounts[1], accounts[3], accounts[5]]);
            await check([accounts[1], accounts[2], accounts[5]]);
            await check([]);
            await check(accounts.splice());
            await check([accounts[4]]);
        });
    });


    describe("configs", async () => {

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

    /*
     * Generic method for testing the proxy
     */
    let callProxy = async args => {
        if (!args) args = {};
        let g = (x, y) => typeof x == 'undefined' ? y : x;
        let auth = args.auth || await Gateway.new();
        await auth.setMembers(g(args.m, 2), g(args.members, members));

        let callData = g(args.callData, web3.eth.abi.encodeFunctionSignature('getAdmin()'));

        let target = args.target || auth.address;

        let nonce = g(args.nonce, await auth.getNonce(target) + 1);
        let msg = web3.utils.soliditySha3(target, nonce, callData);

        let r = [];
        let s = [];
        let v = [];

        let signers = g(args.signers, members.slice(0, 2));
        for (let i=0; i<signers.length; i++)
            await signParts(msg, signers[i], r, s, v);

        let from = {from: args.from || accounts[0]};

        return args.call ?
            auth.proxy.call(target, nonce, callData, r, s, v, from) :
            auth.proxy(target, nonce, callData, r, s, v, from);
    }

    describe("proxy", async () => {

        it('succeed if properly signed', async () => {
          let res = await callProxy({ call: 1 });
          assert.equal(
              accounts[0],
              web3.eth.abi.decodeParameter('address', res),
              "unexpected return data");
        });

        it('revert if properly signed but call fails', async () => {
          let auth = await Gateway.new();

          let callData = web3.eth.abi.encodeFunctionCall({
            name: "setAdmin",
            type: "function",
            inputs: [{ type: 'address', name: '_newAdmin' }]
          }, [accounts[0]]);

          try {
            await callProxy({ auth, callData });
            assert.fail();
          } catch (e) {
            assert((e+"").includes("revert"));
            assert((e+"").includes("not admin"));
          }
        });

        let zz = "0x0000000000000000000000000000000000000000000000000000000000000000";

        it('fail if arrays mismatched', async () => {
            let auth = await Gateway.new();
            await auth.setMembers(1, members);
            await assertFail("arrays mismatched", 
                auth.proxy(accounts[2], 1, "0x00", [zz], [zz, zz], [0, 0])
            );
            await assertFail("arrays mismatched", 
                auth.proxy(accounts[2], 2, "0x00", [zz, zz], [zz], [0, 0])
            );
            await assertFail("arrays mismatched", 
                auth.proxy(accounts[2], 3, "0x00", [zz, zz], [zz, zz], [0])
            );
        });

        it('fail if not enough sigs', async () => {
            await assertFail("not enough sigs", 
                callProxy({ signers: [accounts[0]] })
            );
        });

        it("nonce must increment", async () => {
            let auth = await Gateway.new();
            let auth2 = await Gateway.new();

            await assertFail("nonce is low",
                callProxy({ auth, nonce: 0 })
            );

            await callProxy({ auth, nonce: 1 });

            await assertFail("nonce is low",
                callProxy({ auth, nonce: 1 })
            );

            // works because different address
            await callProxy({ auth, nonce: 1, target: auth2.address }) 
        });

        it("fail with 0 members", async () => {
            await assertFail("not member", callProxy({ members: [] }));
        });

        it('fail if proxy is called by non member', async () => {
            await assertFail("not member", callProxy({ from: accounts[6] }));
        });

        it('fail with requiredSigs == 0', async () => {
            await assertFail("disabled", callProxy({ m: 0 }));
        });
    });

    describe("proxy sig failures", async () => {

        /// Sig failures all result in the same message, so
        /// this function differentiates by way of a control case.

        let controlProxyFailure = async (control, fail) => {
            // Control case passes
            await callProxy(control);
            await assertFail("wrong sig or not sorted by address", callProxy(fail));
        }

        it("fail if sigs are ok but out of order", async () => {
            await controlProxyFailure(
                { signers: [members[0], members[1]] },
                { signers: [members[1], members[0]] });
        });

        it("fail if many sigs are the same", async () => {
            await controlProxyFailure(
                { signers: [members[0], members[1]] },
                { signers: [members[0], members[0]] });
        });

        it("fail if sigs are wrong members", async () => {
            let wmembers = [accounts[0], accounts[6]];
            wmembers.sort();
            await controlProxyFailure(
                { signers: [members[0], members[1]] },
                { signers: wmembers });
        });
    });
});


let signParts = async (msg, addr, r, s, v) => {
    let sig = await web3.eth.sign(msg, addr);
    assert.equal(web3.eth.accounts.recover(msg, sig, false), addr, 'recover failed');

    r.push(sig.substr(0, 66));
    s.push("0x" + sig.substr(66, 64));
    v.push(sig.substr(131) == '1' ? 28 : 27);
    // v.push(2 + 35 + parseInt(sig.substr(131)));
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
