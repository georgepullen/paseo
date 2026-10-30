import { useRpcMutation } from "paseo-plugin-helper/core";
import { useHostTheme } from "paseo-plugin-helper/lifecycle";
import { HostButton } from "paseo-plugin-helper/ui";
import { Icon } from "@getpaseo/plugin/client/react-native";
import React, { useState, type ReactNode } from "react";
import { Pressable, Text, TextInput, View, type KeyboardTypeOptions } from "react-native";
import { hostsAddRpc, hostsRemoveRpc, hostsUpdateRpc, type HostRecord, type WakeTransport } from "../shared/registry";

/**
 * Add/edit form for one host: a name, how to wake it (a primary method plus
 * optional fallbacks), and how to tell it is up. Rarely needed fields sit
 * behind "Advanced" toggles. Editing sends only the fields this form owns,
 * so settings managed elsewhere (inference proxy, hold command) survive.
 */

type Method = WakeTransport["type"];

const METHODS: Array<{ value: Method; label: string }> = [
  { value: "wol", label: "Wake-on-LAN" },
  { value: "http", label: "HTTP" },
  { value: "microlink", label: "Microlink" },
  { value: "command", label: "Command" },
];

interface MethodDraft {
  type: Method;
  url: string;
  tokenRef: string;
  mac: string;
  broadcast: string;
  command: string;
  host: string;
  port: string;
  udp: boolean;
  secretRef: string;
  scheme: string;
  headerPrefix: string;
}

function emptyDraft(type: Method = "wol"): MethodDraft {
  return {
    type,
    url: "",
    tokenRef: "",
    mac: "",
    broadcast: "",
    command: "",
    host: "",
    port: "",
    udp: false,
    secretRef: "",
    scheme: "",
    headerPrefix: "",
  };
}

/** Split a command line on whitespace, honouring single and double quotes. */
export function splitCommandLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: string | null = null;
  let quoted = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      quoted = true;
    } else if (/\s/.test(ch)) {
      if (current || quoted) out.push(current);
      current = "";
      quoted = false;
    } else {
      current += ch;
    }
  }
  if (current || quoted) out.push(current);
  return out;
}

export function joinCommandLine(parts: string[]): string {
  return parts
    .map((part) => (part === "" || /[\s"']/.test(part) ? (part.includes('"') ? `'${part}'` : `"${part}"`) : part))
    .join(" ");
}

function toDraft(transport: WakeTransport): MethodDraft {
  const draft = emptyDraft(transport.type);
  switch (transport.type) {
    case "http":
      return { ...draft, url: transport.url, tokenRef: transport.tokenRef ?? "" };
    case "wol":
      return { ...draft, mac: transport.mac, broadcast: transport.host ?? "" };
    case "command":
      return { ...draft, command: joinCommandLine([transport.command, ...(transport.args ?? [])]) };
    case "microlink":
      return {
        ...draft,
        host: transport.host,
        port: transport.port !== undefined ? String(transport.port) : "",
        udp: transport.mode === "udp",
        secretRef: transport.secretRef ?? "",
        scheme: transport.scheme ?? "",
        headerPrefix: transport.headerPrefix ?? "",
      };
  }
}

/** The transport for a draft, or an error naming what is missing. */
function fromDraft(draft: MethodDraft): WakeTransport | string {
  const opt = (value: string) => (value.trim() ? value.trim() : undefined);
  switch (draft.type) {
    case "http":
      if (!draft.url.trim()) return "Enter the wake URL.";
      return { type: "http", url: draft.url.trim(), ...(opt(draft.tokenRef) ? { tokenRef: opt(draft.tokenRef) } : {}) };
    case "wol":
      if (!/^[0-9a-fA-F]{2}([:-][0-9a-fA-F]{2}){5}$/.test(draft.mac.trim()))
        return "Enter a MAC address like 00:11:22:33:44:55.";
      return { type: "wol", mac: draft.mac.trim(), ...(opt(draft.broadcast) ? { host: opt(draft.broadcast) } : {}) };
    case "command": {
      const [command, ...args] = splitCommandLine(draft.command.trim());
      if (!command) return "Enter the wake command.";
      return { type: "command", command, ...(args.length > 0 ? { args } : {}) };
    }
    case "microlink": {
      if (!draft.host.trim()) return "Enter the wake board's address.";
      const port = Number.parseInt(draft.port, 10);
      if (draft.port.trim() && !(port >= 1 && port <= 65535)) return "Port must be between 1 and 65535.";
      return {
        type: "microlink",
        host: draft.host.trim(),
        ...(draft.port.trim() ? { port } : {}),
        ...(draft.udp ? { mode: "udp" as const } : {}),
        ...(opt(draft.secretRef) ? { secretRef: opt(draft.secretRef) } : {}),
        ...(opt(draft.scheme) ? { scheme: opt(draft.scheme) } : {}),
        ...(opt(draft.headerPrefix) ? { headerPrefix: opt(draft.headerPrefix) } : {}),
      };
    }
  }
}

export function HostForm({
  editing,
  onSaved,
  onCancel,
}: {
  editing: HostRecord | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const { colors } = useHostTheme();
  const [name, setName] = useState(editing?.name ?? "");
  const [methods, setMethods] = useState<MethodDraft[]>(
    editing && editing.wakeTransports.length > 0 ? editing.wakeTransports.map(toDraft) : [emptyDraft()],
  );
  const [token, setToken] = useState("");
  const [sshTarget, setSshTarget] = useState(editing?.sshTarget ?? "");
  const [statusCommand, setStatusCommand] = useState(
    editing?.statusCommand
      ? joinCommandLine([editing.statusCommand.command, ...(editing.statusCommand.args ?? [])])
      : "",
  );
  const [wakeWindow, setWakeWindow] = useState(
    editing?.wakeWindowSeconds !== undefined ? String(editing.wakeWindowSeconds) : "",
  );
  const [showAdvanced, setShowAdvanced] = useState(Boolean(editing?.statusCommand || editing?.wakeWindowSeconds));
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const onResult = (verb: string) => (result: { saved: boolean; error: string | null }) => {
    if (result.saved) onSaved(`${name.trim() || editing?.name} ${verb}`);
    else setError(result.error ?? `Could not ${verb === "removed" ? "remove" : "save"} the host.`);
  };
  const onFailure = (cause: Error) => setError(cause.message);
  const add = useRpcMutation(hostsAddRpc, { onSuccess: onResult("added"), onError: onFailure });
  const update = useRpcMutation(hostsUpdateRpc, { onSuccess: onResult("saved"), onError: onFailure });
  const remove = useRpcMutation(hostsRemoveRpc, { onSuccess: onResult("removed"), onError: onFailure });

  const setMethod = (index: number, patch: Partial<MethodDraft>) =>
    setMethods((prev) => prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));

  const save = () => {
    setError(null);
    if (!name.trim()) return setError("Give the host a name.");
    const transports: WakeTransport[] = [];
    for (const draft of methods) {
      const built = fromDraft(draft);
      if (typeof built === "string") return setError(built);
      transports.push(built);
    }
    const window = Number.parseInt(wakeWindow, 10);
    if (wakeWindow.trim() && !(window >= 10 && window <= 3600))
      return setError("Wake window must be 10 to 3600 seconds.");
    const [statusBin, ...statusArgs] = splitCommandLine(statusCommand.trim());
    const status = statusBin ? { command: statusBin, ...(statusArgs.length > 0 ? { args: statusArgs } : {}) } : null;
    const fields = {
      name: name.trim(),
      wakeTransports: transports,
      ...(token.trim() ? { token: token.trim() } : {}),
    };
    if (editing) {
      update.mutate({
        id: editing.id,
        ...fields,
        sshTarget: sshTarget.trim() || null,
        statusCommand: status,
        wakeWindowSeconds: wakeWindow.trim() ? window : null,
      });
    } else {
      add.mutate({
        ...fields,
        ...(sshTarget.trim() ? { sshTarget: sshTarget.trim() } : {}),
        ...(status ? { statusCommand: status } : {}),
        ...(wakeWindow.trim() ? { wakeWindowSeconds: window } : {}),
      });
    }
  };

  const usesHttp = methods.some((draft) => draft.type === "http");

  return (
    <View style={{ gap: 24 }}>
      <Field label="Name">
        <Input value={name} onChangeText={setName} placeholder="build-box" autoFocus={!editing} />
      </Field>

      <Group title="Wake">
        {methods.map((draft, index) => (
          <View key={index} style={{ gap: 14 }}>
            {index > 0 ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingTop: 16,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>Fallback {index}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove fallback ${index}`}
                  onPress={() => setMethods((prev) => prev.filter((_, i) => i !== index))}
                  hitSlop={8}
                >
                  <Icon name="X" size={14} color={colors.foregroundMuted} />
                </Pressable>
              </View>
            ) : null}
            <Segmented
              value={draft.type}
              options={METHODS}
              onChange={(type) =>
                setMethods((prev) => prev.map((entry, i) => (i === index ? emptyDraft(type) : entry)))
              }
            />
            <MethodFields draft={draft} onChange={(patch) => setMethod(index, patch)} />
          </View>
        ))}
        {usesHttp ? (
          <Field
            label="Bearer token"
            hint={
              editing ? "Leave blank to keep the stored token." : "Optional. Stored on the daemon, never shown again."
            }
          >
            <Input
              value={token}
              onChangeText={setToken}
              placeholder={editing ? "Unchanged" : "Optional"}
              secureTextEntry
            />
          </Field>
        ) : null}
        {methods.length < 8 ? (
          <TextButton
            icon="Plus"
            label="Add fallback method"
            onPress={() => setMethods((prev) => [...prev, emptyDraft()])}
          />
        ) : null}
      </Group>

      <Group title="Status">
        <Field label="SSH target" hint="Checks the host is up and reads compute stats. Uses key auth.">
          <Input value={sshTarget} onChangeText={setSshTarget} placeholder="user@build-box" />
        </Field>
        <TextButton
          icon={showAdvanced ? "ChevronDown" : "ChevronRight"}
          label="Advanced"
          onPress={() => setShowAdvanced((value) => !value)}
        />
        {showAdvanced ? (
          <View style={{ gap: 14 }}>
            <Field label="Status command" hint="Runs on this machine; exit 0 means up. Overrides SSH for status.">
              <Input value={statusCommand} onChangeText={setStatusCommand} placeholder="ping -c1 -W2 build-box" />
            </Field>
            <Field label="Wake window" hint="Seconds to wait for the host after waking. Default 110.">
              <Input value={wakeWindow} onChangeText={setWakeWindow} placeholder="110" keyboardType="number-pad" />
            </Field>
          </View>
        ) : null}
      </Group>

      {error ? <Text style={{ color: colors.statusDanger, fontSize: 13 }}>{error}</Text> : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {editing ? (
          <TextButton
            label={confirmRemove ? "Click again to remove" : "Remove host"}
            danger
            onPress={() => (confirmRemove ? remove.mutate({ id: editing.id }) : setConfirmRemove(true))}
          />
        ) : null}
        <View style={{ flex: 1 }} />
        <HostButton label="Cancel" variant="secondary" onPress={onCancel} />
        <HostButton
          label={editing ? "Save" : "Add host"}
          variant="primary"
          onPress={save}
          loading={add.isPending || update.isPending}
        />
      </View>
    </View>
  );
}

function MethodFields({ draft, onChange }: { draft: MethodDraft; onChange: (patch: Partial<MethodDraft>) => void }) {
  const [advanced, setAdvanced] = useState(Boolean(draft.scheme || draft.headerPrefix || draft.udp || draft.tokenRef));
  switch (draft.type) {
    case "wol":
      return (
        <Row>
          <Field label="MAC address" flex={3}>
            <Input value={draft.mac} onChangeText={(mac) => onChange({ mac })} placeholder="00:11:22:33:44:55" />
          </Field>
          <Field label="Broadcast address" flex={2}>
            <Input
              value={draft.broadcast}
              onChangeText={(broadcast) => onChange({ broadcast })}
              placeholder="Optional"
            />
          </Field>
        </Row>
      );
    case "http":
      return (
        <View style={{ gap: 14 }}>
          <Field label="URL" hint="Receives a POST to wake the host.">
            <Input value={draft.url} onChangeText={(url) => onChange({ url })} placeholder="http://192.0.2.10/wake" />
          </Field>
          {draft.tokenRef || advanced ? (
            <Field label="Token ref" hint="Name of a stored token to send instead of the bearer token below.">
              <Input
                value={draft.tokenRef}
                onChangeText={(tokenRef) => onChange({ tokenRef })}
                placeholder="Optional"
              />
            </Field>
          ) : null}
        </View>
      );
    case "command":
      return (
        <Field label="Command" hint="Runs on this machine.">
          <Input
            value={draft.command}
            onChangeText={(command) => onChange({ command })}
            placeholder="wakeonlan 00:11:22:33:44:55"
          />
        </Field>
      );
    case "microlink":
      return (
        <View style={{ gap: 14 }}>
          <Row>
            <Field label="Wake board" flex={3}>
              <Input value={draft.host} onChangeText={(host) => onChange({ host })} placeholder="wake-board.local" />
            </Field>
            <Field label="Port" flex={1}>
              <Input
                value={draft.port}
                onChangeText={(port) => onChange({ port })}
                placeholder="48320"
                keyboardType="number-pad"
              />
            </Field>
          </Row>
          <Field label="Secret ref" hint="Name of the stored HMAC secret.">
            <Input
              value={draft.secretRef}
              onChangeText={(secretRef) => onChange({ secretRef })}
              placeholder="wake-secret"
            />
          </Field>
          <TextButton
            icon={advanced ? "ChevronDown" : "ChevronRight"}
            label="Protocol options"
            onPress={() => setAdvanced((v) => !v)}
          />
          {advanced ? (
            <View style={{ gap: 14 }}>
              <Field label="Transport">
                <Segmented
                  value={draft.udp ? "udp" : "http"}
                  options={[
                    { value: "http", label: "HTTP" },
                    { value: "udp", label: "UDP" },
                  ]}
                  onChange={(mode) => onChange({ udp: mode === "udp" })}
                />
              </Field>
              <Row>
                <Field label="Auth scheme" flex={1}>
                  <Input
                    value={draft.scheme}
                    onChangeText={(scheme) => onChange({ scheme })}
                    placeholder="Microlink-HMAC"
                  />
                </Field>
                <Field label="Header prefix" flex={1}>
                  <Input
                    value={draft.headerPrefix}
                    onChangeText={(headerPrefix) => onChange({ headerPrefix })}
                    placeholder="X-Wake-"
                  />
                </Field>
              </Row>
            </View>
          ) : null}
        </View>
      );
  }
}

// --- Form primitives ---------------------------------------------------------

function Group({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useHostTheme();
  return (
    <View style={{ gap: 14 }}>
      <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", gap: 12 }}>{children}</View>;
}

function Field({ label, hint, flex, children }: { label: string; hint?: string; flex?: number; children: ReactNode }) {
  const { colors } = useHostTheme();
  return (
    <View style={{ gap: 6, ...(flex !== undefined ? { flex, minWidth: 0 } : {}) }}>
      <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>{label}</Text>
      {children}
      {hint ? <Text style={{ color: colors.foregroundMuted, fontSize: 11, opacity: 0.75 }}>{hint}</Text> : null}
    </View>
  );
}

function Input({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoFocus,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoFocus?: boolean;
}) {
  const { colors, alpha } = useHostTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={alpha(colors.foregroundMuted, 0.45)}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoFocus={autoFocus}
      autoCapitalize="none"
      autoCorrect={false}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        {
          height: 36,
          paddingHorizontal: 12,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: focused ? colors.accent : "transparent",
          backgroundColor: colors.surface2,
          color: colors.foreground,
          fontSize: 13,
        },
        // react-native-web draws its own focus ring; the border above replaces it.
        { outlineWidth: 0 } as object,
      ]}
    />
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const { colors } = useHostTheme();
  return (
    <View style={{ flexDirection: "row", padding: 3, gap: 3, borderRadius: 9, backgroundColor: colors.surface2 }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 6,
              borderRadius: 6,
              backgroundColor: selected ? colors.surface0 : "transparent",
            }}
          >
            <Text
              style={{
                color: selected ? colors.foreground : colors.foregroundMuted,
                fontSize: 12,
                fontWeight: selected ? "600" : "400",
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TextButton({
  label,
  icon,
  danger,
  onPress,
}: {
  label: string;
  icon?: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const { colors } = useHostTheme();
  const color = danger ? colors.statusDanger : colors.foregroundMuted;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={6}
      style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" }}
    >
      {icon ? <Icon name={icon} size={13} color={color} /> : null}
      <Text style={{ color, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}
