# Architecture Note

## Scope

This implementation is the required EVM commit-reveal track. It protects
answers from other participants during the submission phase. It does not claim
that answers remain permanently private after Reveal.

## Components

- `AIJudge.sol`: stores bounties, commitments, revealed answers, AI reviews, and
  final winners.
- Participant client: generates salts, computes commitments, stores private
  answer material, and submits transactions.
- Bounty owner or judging backend: reads revealed answers and constructs one
  deterministic batch LLM request.
- Ritual LLM inference precompile: evaluates the batch and returns the AI
  review.
- `MockAIJudge.sol`: replaces only the external AI call during local tests. It
  is not the production deployment target.

## Data by Phase

| Phase | On-chain | Off-chain and hidden |
|---|---|---|
| Create | Owner, title, rubric, reward, deadlines | Nothing required |
| Commit | Participant address and commitment | Answer and salt |
| Reveal | Answer, commitment, address, reveal status | Salt may remain locally backed up |
| Judge | Revealed submissions, AI review, judged status | Batch prompt construction and Ritual execution context |
| Finalize | Winner index, winner address, finalized status, payment | Optional human review notes |

## Plaintext Locations

Before Reveal, plaintext exists only in the participant's client or storage.
The contract receives only a commitment hash. During Reveal, the participant
sends the plaintext answer in a transaction, so the answer becomes public in
calldata and contract storage. During judging, the bounty owner or backend
reads these public revealed answers and places them into one plaintext batch
request for Ritual.

This is different from the optional TEE track. A TEE design would encrypt
answers before they reach public storage and expose plaintext only inside the
trusted execution environment.

## Commitment Verification

The commitment is:

```solidity
keccak256(abi.encode(answer, salt, msg.sender, bountyId))
```

Including `msg.sender` prevents a different address from taking another
participant's answer and salt. Including `bountyId` prevents the same
commitment from being replayed in another bounty.

## Batch Judging Flow

```text
Revealed on-chain submissions
          |
          v
Owner/backend filters revealed == true
          |
          v
One ordered prompt containing all eligible answers
          |
          v
judgeAll(bountyId, llmInput)
          |
          v
Ritual LLM precompile executes one batch evaluation
          |
          v
AI review is stored on-chain
          |
          v
Owner finalizes a valid revealed winner index
```

The intended batch order is the contract's submission index order. The prompt
should include the bounty ID, published rubric, each eligible submission index,
and each revealed answer. The LLM should return a winner index and explanation.

## Trust Boundaries

The contract enforces phase timing, commitment validity, one submission per
wallet, one reveal per submission, owner-only judging, and winner eligibility.

The contract does not parse the arbitrary `llmInput` byte format. Therefore,
the owner or judging backend is responsible for including every eligible
revealed answer without modification. A production frontend should construct
this batch deterministically, publish it for inspection, and optionally record
its hash so observers can reproduce the AI request.

The AI review does not automatically transfer funds. The owner explicitly
calls `finalizeWinner`, which keeps the final decision attributable and allows
human review.

## Failure Handling

- A missing or wrong salt causes Reveal to revert.
- A participant that never reveals is not eligible to win.
- Judging cannot start before the reveal deadline.
- Judging cannot start with zero revealed submissions.
- An invalid winner index or unrevealed winner causes finalization to revert.
- Finalization sets the reward to zero before the external payment call,
  preventing the same reward from being paid twice.
