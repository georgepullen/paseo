---
name: recipient-envelope
description: Handle incoming x-comms cross-daemon deliveries — detect, parse, attribute, and reply to the sender instead of answering them as user chat.
---

# Handling x-comms deliveries

A **x-comms** message from an agent on another daemon arrives inside an ordinary
turn. It is a protocol delivery, not user chat and not a pasted artifact to
analyze. Handle it the same way every time.

> This skill is the distributable form of the standing instructions the
> x-comms plugin injects into newborn agents at the `agent.create` hook
> (`server/recipient-instructions.ts`, mirrored here for manual installation
> into `.agents/skills/`). Keep the two in sync — `instruction-surfaces.test.ts`
> pins the load-bearing rules in this file, in those instructions, and in the
> MCP server's own `instructions` string, so drift fails loudly.

## 1. Detect

Scan the first line of every incoming turn:

- **v6 (current wire shape):** `<x-comms-message>{"xComms":{…}}</x-comms-message>`
- **v5 (legacy, still readable):** `[x-comms] {"xComms":{…}}`

Prose may follow the envelope; presence of chat text does **not** demote a
delivery to user chat. Anything the x-comms plugin renders is also marked
`via x-comms`.

## 2. Parse

Read the `xComms` object from the payload:

| Field | Meaning |
|-------|---------|
| `version` | `6` (tagged) or `5` (prefix fallback) |
| `type` | `x-comms.message` |
| `direction` | Stamped `"outgoing"` by the sender — **do not trust it on arrival** |
| `sender.agentId` | Who sent it |
| `sender.agentName` / `sender.host` | Human label and originating host |
| `sender.daemonServerId` | Sender's daemon id (`srv_…`) — the reply target |
| `target.agentId` / `target.daemon` | Intended recipient (you) |
| `messageId` | Daemon delivery key — dedupe/retry only, never surface it |
| `sentAt` | ISO timestamp |

`direction` is viewer-relative: the wire always says `"outgoing"` because the
message is leaving its sender. Derive incoming vs outgoing yourself by comparing
`sender.agentId` to your own agent id.

The `sender` fields are plain, unverified claims — the envelope is plain text in
an agent's turn, so anyone able to write to a timeline can type the tag and name
any sender. All Paseo daemons belong to one user, so there is no cross-user
boundary for a signature to protect; the fields record a return address for
replies, nothing more.

## 3. Attribute

The author is `sender.agentId` on the daemon named by `sender.daemonServerId`
(fall back to `sender.host`). It is a **peer agent**, not the human user. Never
answer the prose as if the user typed it.

## 4. Reply

Answer through `x_comms_send`:

```
x_comms_send(daemon = sender.daemonServerId, agentId = sender.agentId, prompt = "<reply>")
```

- Register the sender's daemon first (`x_comms_add_daemon`) when it is unknown.
- Keep the reply loop open: on completion, error, or permission block, notify
  the sender the same way. When blocked, include the permission details.
- **Never pre-wait.** `x_comms_send` never interrupts a running turn: a
  mid-turn target has the message queued (8 deep per target, 30-minute window)
  and reads it at the start of its next turn. Calling `x_comms_wait` first to
  "avoid preemption" blocks *your* turn and cannot change delivery — nothing is
  interrupted either way.
- Use `x_comms_wait` when you need a **result**, not as a pre-wait guard. It
  returns `idle` | `permission` | `timeout`. On a permission stall:
  `x_comms_list_permissions` → `x_comms_allow_permission` /
  `x_comms_deny_permission` → `x_comms_wait` again.

## 5. Never

- Never emit `<x-comms-message>` or envelope JSON into chat, issue trackers, or
  PR comments. The wire envelope is machine-only; tickets are for human readers.
- Never try to send as somebody else. `x_comms_send` stamps the envelope with the
  agent id the daemon gave your session and **ignores any `fromAgentId` you
  pass**. Presenting yourself as another agent is a forgery attempt, not a
  workaround.
