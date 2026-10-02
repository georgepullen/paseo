import React from "react";

function stub(name: string) {
  function RNStub(props: any) {
    return React.createElement(name, props, props?.children);
  }
  Object.defineProperty(RNStub, "name", { value: `RN${name}` });
  return RNStub;
}

function refStub(name: string, handle?: Record<string, unknown>) {
  const RNRefStub = React.forwardRef<any, any>((props, ref) => {
    React.useImperativeHandle(ref, () => handle ?? {}, []);
    return React.createElement(name, props, props?.children);
  });
  Object.defineProperty(RNRefStub, "name", { value: `RN${name}` });
  return RNRefStub;
}

export const View = stub("View");
export const Text = stub("Text");
export const Pressable = refStub("Pressable");
export const ScrollView = stub("ScrollView");
export const TextInput = stub("TextInput");
export const TouchableWithoutFeedback = refStub("TouchableWithoutFeedback");
export const Modal = refStub("Modal");
export const FlatList = stub("FlatList");
export const ActivityIndicator = stub("ActivityIndicator");

export const StyleSheet = {
  create: <T extends Record<string, any>>(styles: T): T => styles,
  flatten: (style: any) => style,
  hairlineWidth: 1,
  compose: (a: any, b: any) => [a, b],
  absoluteFill: { position: "absolute" as const, top: 0, right: 0, bottom: 0, left: 0 },
  absoluteFillObject: { position: "absolute" as const, top: 0, right: 0, bottom: 0, left: 0 },
};

export const Platform = {
  OS: "web",
  select: <T,>(options: { web?: T; default?: T } & Record<string, T>): T | undefined =>
    options.web ?? options.default,
};

export default {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  TouchableWithoutFeedback,
  Modal,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
};
