import assert from "node:assert/strict";
import test from "node:test";
import { detectSiteProtectionBlock } from "./goto.js";

test("detects HTTP authorization denials before capture", () => {
  assert.equal(detectSiteProtectionBlock({
    status: 403,
    title: "Forbidden",
    bodyText: "",
  }), true);
  assert.equal(detectSiteProtectionBlock({
    status: 401,
    title: "",
    bodyText: "Authentication required",
  }), true);
});

test("detects browser-verification and security challenge pages", () => {
  const blockedPages = [
    {
      title: "Failed to verify your browser",
      bodyText: "Please refresh and try again. Code 21.",
    },
    {
      title: "Just a moment...",
      bodyText: "Checking your browser before accessing the website.",
    },
    {
      title: "Security checkpoint",
      bodyText: "Verify that you are human to continue.",
    },
    {
      title: "Access Denied",
      bodyText: "You do not have permission to access this server.",
    },
  ];

  for (const page of blockedPages) {
    assert.equal(detectSiteProtectionBlock(page), true);
  }
});

test("does not classify ordinary website copy as a protection block", () => {
  assert.equal(detectSiteProtectionBlock({
    status: 200,
    title: "Browser tools for developers",
    bodyText: "Verify your email address to finish creating your account.",
  }), false);
  assert.equal(detectSiteProtectionBlock({
    status: 200,
    title: "Security for modern teams",
    bodyText: "Learn how our browser extension keeps your workspace safe.",
  }), false);
});
