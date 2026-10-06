// Declared paseo-plugin-helper expectation for paseo-research-feed.
//
// This plugin imports the bare `paseo-plugin-helper/<tree>` specifiers, which
// resolve through this checkout's tsconfig `paths` alias into
// ../../packages/paseo-plugin-helper/src. Resolution is therefore "checkout",
// and this file records what that resolution is supposed to be, so
// scripts/helper-resolution.test.mjs can contradict it if the two ever
// disagree (#633, #649).
//
// HELPER_VERSION is the helper's own package.json `version`, not a scheme
// invented for this plugin. HELPER_REVISION is a content digest of
// packages/paseo-plugin-helper/src at stamp time; it is the authoritative
// check, and it is preferred over the checkout sha in shared/version.ts
// because a squash-merge deletes the very commit that sha names, orphaning it
// in every clean clone while it still resolves on any machine holding the
// branch worktree.
export const HELPER_VERSION = "0.4.0-beta.12";
export const HELPER_SERVED_FROM = "checkout";
export const HELPER_REVISION = "sha256:6202feb14fca";
