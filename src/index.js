import debug from "debug";
const log = debug("llm.js");

import SchemaConverter from "../lib/jsonschema-to-gbnf.js";
import LlamaFile from "./llamafile.js";
import OpenAI from "./openai.js";

const LLAMAFILE = "llamafile";
const OPENAI = "openai";
const ANTHROPIC = "anthropic";
const SERVICES = [LLAMAFILE, OPENAI, ANTHROPIC];

export default function LLM(input, options = {}) {

    // function call
    if (!(this instanceof LLM)) {
        return new Promise(async (resolve, reject) => {
            const llm = new LLM(input, options);
            try {
                resolve(await llm.send());
            } catch (e) {
                reject(e);
            }
        });
    }

    // object call
    if (typeof input === "string" && input.length > 0) {
        this.messages = [{ role: "user", content: input }];
    } else if (Array.isArray(input)) {
        this.messages = input;
    } else {
        this.messages = [];
    }

    this.options = options;
}

LLM.prototype.send = async function (opts = {}) {
    const options = Object.assign({}, this.options, opts);

    const service = LLM.serviceForModel(options.model);

    if (service == LLAMAFILE && options.schema) {
        options.schema = LLM.convertJSONSchemaToBNFS(options.schema);
    }

    let response;

    log(`send() service=${service}`);

    if (service === LLAMAFILE) {
        response = await LlamaFile(this.messages, options);
    } else if (service === OPENAI) {
        response = await OpenAI(this.messages, options);
    } else if (service === ANTHROPIC) {
        // const Anthropics = (await import("./anthropic.js")).default;
        // response = await Anthropics(this.messages, options);
    } else {
        throw new Error(`Unknown service ${service}`);
    }

    if (options.stream) {
        return this.stream_response(response);
    }

    this.assistant(response);
    return response;
}

LLM.prototype.stream_response = async function* (response) {
    let buffer = "";
    for await (const chunk of response) {
        buffer += chunk;
        yield chunk;
    }

    this.assistant(buffer);
}

LLM.prototype.chat = async function (content, options = null) {
    this.user(content);
    return await this.send(options);
}

LLM.prototype.user = function (content) {
    this.history("user", content);
}

LLM.prototype.system = function (content) {
    this.history("system", content);
}

LLM.prototype.assistant = function (content) {
    this.history("assistant", content);
}

LLM.prototype.history = function (role, content) {
    if (!content) throw new Error("No content provided");
    if (typeof content !== "string") { content = JSON.stringify(content) }
    this.messages.push({ role, content });
}

LLM.convertJSONSchemaToBNFS = function (schema) {
    const converter = new SchemaConverter();
    converter.visit(schema, "");
    return converter.formatGrammar();
}

LLM.serviceForModel = function (model) {
    if (!model || typeof model !== "string") {
        return LLAMAFILE;
    }

    if (model.indexOf("gpt-") === 0) {
        return OPENAI;
    } else if (model.indexOf("claude-") === 0) {
        return ANTHROPIC;
    } {
        return LLAMAFILE;
    }
}
