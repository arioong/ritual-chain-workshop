# Privacy-Preserving AI Bounty Judge

This project extends the Ritual Chain workshop bounty judge with a
commit-reveal submission flow. During the submission phase, participants place
only a commitment hash on-chain. After submissions close, they reveal the
answer and salt, and the contract verifies that the reveal matches the original
commitment.

The implementation is compatible with EVM chains and keeps the existing Ritual
LLM precompile integration for batch judging.

## Project Structure

```text
hardhat/
  contracts/AIJudge.sol              Main bounty contract
  contracts/mocks/MockAIJudge.sol    Local AI response used only by tests
  test/AIJudge.ts                     Commit-reveal and judging tests
  ignition/modules/AIJudge.ts         Deployment module
  ARCHITECTURE.md                     Data flow and trust boundaries
  TEST_PLAN.md                        Reveal and judging test plan
web/                                  Workshop frontend
```

## Bounty Lifecycle

### 1. Create

The bounty owner calls `createBounty` with:

- a title;
- an evaluation rubric;
- a submission deadline;
- a later reveal deadline; and
- an ETH reward.

### 2. Commit

Before the submission deadline, a participant creates a random 32-byte salt and
computes the commitment off-chain:

```solidity
keccak256(abi.encode(answer, salt, participantAddress, bountyId))
```

The participant calls:

```solidity
submitCommitment(uint256 bountyId, bytes32 commitment)
```

Only the participant address and commitment are stored. The answer and salt
must remain off-chain and secret during this phase.

### 3. Reveal

After the submission deadline and before the reveal deadline, the same wallet
calls:

```solidity
revealAnswer(uint256 bountyId, string answer, bytes32 salt)
```

The contract recomputes the commitment with `msg.sender` and `bountyId`. A
changed answer, wrong salt, or different wallet fails verification. A
participant may reveal only once.

### 4. Batch AI Judging

After the reveal deadline, the bounty owner calls:

```solidity
judgeAll(uint256 bountyId, bytes llmInput)
```

The off-chain caller reads the valid revealed submissions, constructs one batch
prompt, and passes it to Ritual in one LLM request. The contract rejects judging
when no valid answer was revealed and records the returned AI review.

### 5. Finalize

The owner calls:

```solidity
finalizeWinner(uint256 bountyId, uint256 winnerIndex)
```

The winner index must exist and must refer to a submission that successfully
revealed. The contract records the winner, prevents repeated finalization, and
transfers the bounty reward.

## Commitment Example with viem

```typescript
import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
} from "viem";

const commitment = keccak256(
  encodeAbiParameters(
    parseAbiParameters(
      "string answer, bytes32 salt, address participant, uint256 bountyId",
    ),
    [answer, salt, participantAddress, bountyId],
  ),
);
```

The frontend must use ABI encoding that matches Solidity's `abi.encode`.
`encodePacked` must not be substituted.

## Local Setup

Requirements:

- Node.js
- pnpm
- Git

Install and compile:

```bash
cd hardhat
pnpm install
npx hardhat compile
```

Run the TypeScript tests:

```bash
npx hardhat test nodejs
```

Expected result:

```text
9 passing
```

Deploy through the included Ignition module:

```bash
npx hardhat ignition deploy ignition/modules/AIJudge.ts
```

## Security Notes

- The salt must be random, secret, and backed up until Reveal.
- Losing the salt makes a valid reveal impossible.
- Binding the commitment to the participant address prevents another wallet
  from stealing a reveal.
- Binding it to the bounty ID prevents reuse across different bounties.
- Answers become public on-chain during Reveal. Commit-reveal hides them only
  during the submission phase.
- The bounty owner or backend constructs `llmInput`. Production clients should
  build it deterministically from all revealed on-chain submissions and display
  the batch for public verification.
- AI output is a recommendation. The final on-chain action remains attributable
  to the bounty owner.

## Deliverables

- Updated Solidity contract: `hardhat/contracts/AIJudge.sol`
- Lifecycle documentation: this README
- Test plan: `hardhat/TEST_PLAN.md`
- Architecture note: `hardhat/ARCHITECTURE.md`
- Reflection: below

## Reflection

Bounty rules, deadlines, reward amounts, and final results should be public so
that participants can verify the process. Participants' answers and salts
should remain hidden during the submission phase to prevent copying and
strategic revisions. Commitment hashes can be public because they prove that a
submission existed without exposing its contents. AI can compare valid revealed
submissions against a published rubric and provide a ranked recommendation with
an explanation. A human should review ambiguous, unsafe, or clearly incorrect
AI decisions before finalizing a winner. The human should not be able to alter
submissions or evaluation rules after the deadline without leaving an auditable
record. This division uses AI for scalable comparison while preserving human
accountability for the final decision.
