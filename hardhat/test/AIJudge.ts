import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  parseEther,
  toHex,
} from "viem";

describe("AIJudge commit-reveal flow", async function () {
  const { viem, networkHelpers } = await network.create();
  const [owner, alice, bob] = await viem.getWalletClients();

  async function deployBountyFixture() {
    const judge = await viem.deployContract("AIJudge");
    const now = await networkHelpers.time.latest();
    const deadline = BigInt(now + 100);
    const revealDeadline = BigInt(now + 200);

    await judge.write.createBounty(
      ["Privacy bounty", "Choose the strongest answer", deadline, revealDeadline],
      { account: owner.account, value: parseEther("1") },
    );

    return { judge, deadline, revealDeadline };
  }

  async function deployMockBountyFixture() {
    const judge = await viem.deployContract("MockAIJudge");
    const now = await networkHelpers.time.latest();
    const deadline = BigInt(now + 100);
    const revealDeadline = BigInt(now + 200);

    await judge.write.createBounty(
      ["Privacy bounty", "Choose the strongest answer", deadline, revealDeadline],
      { account: owner.account, value: parseEther("1") },
    );

    return { judge, deadline, revealDeadline };
  }

  function makeCommitment(
    answer: string,
    salt: `0x${string}`,
    participant: `0x${string}`,
    bountyId = 1n,
  ) {
    return keccak256(
      encodeAbiParameters(
        parseAbiParameters(
          "string answer, bytes32 salt, address participant, uint256 bountyId",
        ),
        [answer, salt, participant, bountyId],
      ),
    );
  }

  it("stores only a commitment during the submission phase", async function () {
    const { judge } = await networkHelpers.loadFixture(deployBountyFixture);
    const answer = "Use zero-knowledge proofs";
    const salt = toHex(new Uint8Array(32).fill(1));
    const commitment = makeCommitment(answer, salt, alice.account.address);

    await judge.write.submitCommitment([1n, commitment], {
      account: alice.account,
    });

    const submission = await judge.read.getSubmission([1n, 0n]);

    assert.equal(
      submission[0].toLowerCase(),
      alice.account.address.toLowerCase(),
    );
    assert.equal(submission[1], commitment);
    assert.equal(submission[2], "");
    assert.equal(submission[3], false);
  });

  it("reveals an answer when the answer and salt match", async function () {
    const { judge, deadline } =
      await networkHelpers.loadFixture(deployBountyFixture);
    const answer = "Use a trusted execution environment";
    const salt = toHex(new Uint8Array(32).fill(2));
    const commitment = makeCommitment(answer, salt, alice.account.address);

    await judge.write.submitCommitment([1n, commitment], {
      account: alice.account,
    });
    await networkHelpers.time.increaseTo(deadline);
    await judge.write.revealAnswer([1n, answer, salt], {
      account: alice.account,
    });

    const submission = await judge.read.getSubmission([1n, 0n]);
    const revealStatus = await judge.read.getRevealStatus([1n]);

    assert.equal(submission[2], answer);
    assert.equal(submission[3], true);
    assert.equal(revealStatus[1], 1n);
  });

  it("rejects a reveal before the submission deadline", async function () {
    const { judge } = await networkHelpers.loadFixture(deployBountyFixture);
    const answer = "Hidden answer";
    const salt = toHex(new Uint8Array(32).fill(3));
    const commitment = makeCommitment(answer, salt, alice.account.address);

    await judge.write.submitCommitment([1n, commitment], {
      account: alice.account,
    });

    await viem.assertions.revertWith(
      judge.write.revealAnswer([1n, answer, salt], {
        account: alice.account,
      }),
      "reveal not started",
    );
  });

  it("rejects a wrong salt or a changed answer", async function () {
    const { judge, deadline } =
      await networkHelpers.loadFixture(deployBountyFixture);
    const answer = "Original answer";
    const salt = toHex(new Uint8Array(32).fill(4));
    const wrongSalt = toHex(new Uint8Array(32).fill(5));
    const commitment = makeCommitment(answer, salt, alice.account.address);

    await judge.write.submitCommitment([1n, commitment], {
      account: alice.account,
    });
    await networkHelpers.time.increaseTo(deadline);

    await viem.assertions.revertWith(
      judge.write.revealAnswer([1n, answer, wrongSalt], {
        account: alice.account,
      }),
      "invalid answer or salt",
    );
    await viem.assertions.revertWith(
      judge.write.revealAnswer([1n, "Changed answer", salt], {
        account: alice.account,
      }),
      "invalid answer or salt",
    );
  });

  it("rejects another wallet and duplicate commitments", async function () {
    const { judge, deadline } =
      await networkHelpers.loadFixture(deployBountyFixture);
    const answer = "Alice answer";
    const salt = toHex(new Uint8Array(32).fill(6));
    const commitment = makeCommitment(answer, salt, alice.account.address);

    await judge.write.submitCommitment([1n, commitment], {
      account: alice.account,
    });

    await viem.assertions.revertWith(
      judge.write.submitCommitment([1n, commitment], {
        account: alice.account,
      }),
      "already submitted",
    );

    await networkHelpers.time.increaseTo(deadline);

    await viem.assertions.revertWith(
      judge.write.revealAnswer([1n, answer, salt], {
        account: bob.account,
      }),
      "no commitment",
    );
  });

  it("rejects reveals after the reveal deadline", async function () {
    const { judge, revealDeadline } =
      await networkHelpers.loadFixture(deployBountyFixture);
    const answer = "Late answer";
    const salt = toHex(new Uint8Array(32).fill(7));
    const commitment = makeCommitment(answer, salt, alice.account.address);

    await judge.write.submitCommitment([1n, commitment], {
      account: alice.account,
    });
    await networkHelpers.time.increaseTo(revealDeadline);

    await viem.assertions.revertWith(
      judge.write.revealAnswer([1n, answer, salt], {
        account: alice.account,
      }),
      "reveal period ended",
    );
  });

  it("allows only the owner to judge after the reveal period", async function () {
    const { judge, revealDeadline } =
      await networkHelpers.loadFixture(deployMockBountyFixture);
    const answer = "Alice answer";
    const salt = toHex(new Uint8Array(32).fill(8));
    const commitment = makeCommitment(answer, salt, alice.account.address);

    await judge.write.submitCommitment([1n, commitment], {
      account: alice.account,
    });

    await viem.assertions.revertWith(
      judge.write.judgeAll([1n, toHex("batch input")], {
        account: owner.account,
      }),
      "reveal period not ended",
    );

    await networkHelpers.time.increaseTo(revealDeadline);

    await viem.assertions.revertWith(
      judge.write.judgeAll([1n, toHex("batch input")], {
        account: alice.account,
      }),
      "not bounty owner",
    );
    await viem.assertions.revertWith(
      judge.write.judgeAll([1n, toHex("batch input")], {
        account: owner.account,
      }),
      "no revealed submissions",
    );
  });

  it("stores a batch AI review and finalizes a revealed winner", async function () {
    const { judge, deadline, revealDeadline } =
      await networkHelpers.loadFixture(deployMockBountyFixture);
    const answer = "Alice winning answer";
    const salt = toHex(new Uint8Array(32).fill(9));
    const commitment = makeCommitment(answer, salt, alice.account.address);
    const aiReview = toHex('{"winnerIndex":0,"reason":"best answer"}');
    const publicClient = await viem.getPublicClient();

    await judge.write.submitCommitment([1n, commitment], {
      account: alice.account,
    });
    await networkHelpers.time.increaseTo(deadline);
    await judge.write.revealAnswer([1n, answer, salt], {
      account: alice.account,
    });
    await networkHelpers.time.increaseTo(revealDeadline);

    await judge.write.setMockReview([aiReview], { account: owner.account });
    await judge.write.judgeAll([1n, toHex("all revealed answers")], {
      account: owner.account,
    });

    const bountyAfterJudging = await judge.read.getBounty([1n]);

    assert.equal(bountyAfterJudging[5], true);
    assert.equal(bountyAfterJudging[9], aiReview);

    const aliceBalanceBefore = await publicClient.getBalance({
      address: alice.account.address,
    });

    await judge.write.finalizeWinner([1n, 0n], {
      account: owner.account,
    });

    const aliceBalanceAfter = await publicClient.getBalance({
      address: alice.account.address,
    });
    const finalizedBounty = await judge.read.getBounty([1n]);

    assert.equal(aliceBalanceAfter - aliceBalanceBefore, parseEther("1"));
    assert.equal(finalizedBounty[3], 0n);
    assert.equal(finalizedBounty[6], true);
    assert.equal(finalizedBounty[8], 0n);
  });

  it("rejects an invalid or unrevealed winner", async function () {
    const { judge, deadline, revealDeadline } =
      await networkHelpers.loadFixture(deployMockBountyFixture);
    const aliceAnswer = "Alice answer";
    const bobAnswer = "Bob hidden answer";
    const aliceSalt = toHex(new Uint8Array(32).fill(10));
    const bobSalt = toHex(new Uint8Array(32).fill(11));

    await judge.write.submitCommitment(
      [1n, makeCommitment(aliceAnswer, aliceSalt, alice.account.address)],
      { account: alice.account },
    );
    await judge.write.submitCommitment(
      [1n, makeCommitment(bobAnswer, bobSalt, bob.account.address)],
      { account: bob.account },
    );

    await networkHelpers.time.increaseTo(deadline);
    await judge.write.revealAnswer([1n, aliceAnswer, aliceSalt], {
      account: alice.account,
    });
    await networkHelpers.time.increaseTo(revealDeadline);

    await judge.write.setMockReview([toHex("Alice wins")], {
      account: owner.account,
    });
    await judge.write.judgeAll([1n, toHex("batch")], {
      account: owner.account,
    });

    await viem.assertions.revertWith(
      judge.write.finalizeWinner([1n, 2n], {
        account: owner.account,
      }),
      "invalid winner index",
    );
    await viem.assertions.revertWith(
      judge.write.finalizeWinner([1n, 1n], {
        account: owner.account,
      }),
      "winner did not reveal",
    );
  });
});
