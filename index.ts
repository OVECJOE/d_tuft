import { fromBytecode } from "./core/bytecode-parser";

console.log(JSON.stringify(
    fromBytecode("6004356024350160005260206000f3"),
    null,
    2
));
