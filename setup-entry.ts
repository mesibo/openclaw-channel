import { defineSetupPluginEntry } from "openclaw/plugin-sdk/core";
import { mesiboChannel } from "./src/channel.js";

export default defineSetupPluginEntry(mesiboChannel);
