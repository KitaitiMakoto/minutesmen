if (typeof global === "undefined" && typeof window !== "undefined") {
    global = window;
}

import ReadableStream from "./streams/reference-implementation/lib/readable-stream";
import WritableStream from "./streams/reference-implementation/lib/writable-stream";
import ByteLengthQueuingStrategy from "./streams/reference-implementation/lib/byte-length-queuing-strategy";
import CountQueuingStrategy from "./streams/reference-implementation/lib/count-queuing-strategy";
import TransformStream from "./streams/reference-implementation/lib/transform-stream";

global.ReadableStream = ReadableStream;
global.WritableStream = WritableStream;
global.ByteLengthQueuingStrategy = ByteLengthQueuingStrategy;
global.CountQueuingStrategy = CountQueuingStrategy;
global.TransformStream = TransformStream;
