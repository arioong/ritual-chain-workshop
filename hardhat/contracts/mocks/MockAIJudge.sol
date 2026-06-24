// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AIJudge} from "../AIJudge.sol";

contract MockAIJudge is AIJudge {
    bytes private mockReview;

    function setMockReview(bytes calldata review) external {
        mockReview = review;
    }

    function _requestAIReview(
        bytes calldata
    ) internal view override returns (bytes memory completionData) {
        return mockReview;
    }
}
