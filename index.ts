import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { mesiboChannel } from "./src/channel.js";

export default defineChannelPluginEntry({
  id: "mesibo",
  name: "Mesibo",
  description: "Connect OpenClaw to the Mesibo real-time messaging platform",
  plugin: mesiboChannel,
});
