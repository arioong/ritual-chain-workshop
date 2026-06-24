# Test Plan

## Automated Test Command

```bash
npx hardhat test nodejs
```

The automated tests are in `test/AIJudge.ts`. `MockAIJudge.sol` supplies a
deterministic AI response locally because the Ritual precompile is available on
the Ritual network, not on the local Hardhat chain.

## Current Automated Cases

| Case | Expected result |
|---|---|
| Submit a commitment before the deadline | Commitment is stored; answer remains empty |
| Reveal with the correct answer and salt | Reveal succeeds and `revealedCount` increases |
| Reveal before the submission deadline | Reverts with `reveal not started` |
| Reveal with a wrong salt | Reverts with `invalid answer or salt` |
| Reveal with a changed answer | Reverts with `invalid answer or salt` |
| Reveal from another wallet | Reverts with `no commitment` |
| Submit twice from one wallet | Reverts with `already submitted` |
| Reveal after the reveal deadline | Reverts with `reveal period ended` |
| Judge before the reveal deadline | Reverts with `reveal period not ended` |
| Judge from a non-owner wallet | Reverts with `not bounty owner` |
| Judge when no answer was revealed | Reverts with `no revealed submissions` |
| Judge a valid batch | AI review is stored and bounty becomes judged |
| Finalize a valid revealed winner | Winner receives the reward |
| Finalize an out-of-range index | Reverts with `invalid winner index` |
| Finalize an unrevealed submission | Reverts with `winner did not reveal` |

## Additional Recommended Cases

These cases should be added if the project is extended:

- Reject an empty commitment.
- Reject commitment submission after the deadline.
- Reject more than `MAX_SUBMISSIONS`.
- Reject an answer longer than `MAX_ANSWER_LENGTH`.
- Reject duplicate Reveal.
- Reject an empty LLM input.
- Reject judging twice.
- Reject finalization before judging.
- Reject finalization twice.
- Confirm a failed reward transfer reverts the entire finalization.
- Confirm commitments cannot be reused across different bounty IDs.
- Confirm identical answers with different salts produce different
  commitments.

## Ritual Network Integration Test

The final integration test on Ritual should:

1. Deploy `AIJudge`, not `MockAIJudge`.
2. Create a bounty with short but safe deadlines.
3. Submit at least two commitments from different wallets.
4. Reveal both answers.
5. Construct one LLM request containing both submissions and the rubric.
6. Call `judgeAll` once.
7. Verify the `AllAnswersJudged` event and stored review.
8. Parse or review the returned winner index.
9. Call `finalizeWinner`.
10. Verify the winner receives the reward.
