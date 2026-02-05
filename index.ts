import { fromBytecode } from "./core/bytecode-parser";

const bytecode = "6004356024350160005260206000f3";
console.log(JSON.stringify(fromBytecode({
    bytes: Uint8Array.from(Buffer.from(bytecode, "hex")),
    origin: "user-provided",
    creationCode: true
}), null, 2));
