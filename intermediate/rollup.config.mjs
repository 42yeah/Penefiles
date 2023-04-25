import {nodeResolve} from "@rollup/plugin-node-resolve";

export default {
    input: "./main.mjs",
    output: {
        file: "../frontend/js/editor.bundle.js",
        format: "iife"
    },
    plugins: [nodeResolve()]
};
