import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(
  new URL("../src/features/rfq/api.ts", import.meta.url),
  "utf8",
);

function loadApi(getImplementation) {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  const scope = {
    module,
    exports: module.exports,
    require: (specifier) => {
      if (specifier === "@/api/v1") {
        return {
          pluginExtensionApi: {
            get: getImplementation,
            post: async () => ({ data: { status: "ok", data: {} } }),
          },
        };
      }
      throw new Error(`Unexpected module: ${specifier}`);
    },
    Blob,
    FormData,
    JSON,
  };
  vm.createContext(scope);
  vm.runInContext(output, scope);
  return module.exports;
}

test("parses revision conflicts without silently overwriting", async () => {
  const { rfqApi, RfqApiError } = loadApi(async () => {
    throw {
      response: {
        status: 409,
        data: { message: "询价已被其他操作更新，请刷新后重试" },
      },
    };
  });

  await assert.rejects(
    rfqApi.list(),
    (error) =>
      error instanceof RfqApiError &&
      error.isConflict === true &&
      error.status === 409 &&
      error.message.includes("刷新"),
  );
});

test("accepts raw successful plugin responses", async () => {
  const { rfqApi } = loadApi(async () => ({ data: { cases: [] } }));

  const result = await rfqApi.list();

  assert.equal(Array.isArray(result.cases), true);
  assert.equal(result.cases.length, 0);
});

test("keeps plugin-missing status available to the diagnostic UI", async () => {
  const { rfqApi, RfqApiError } = loadApi(async () => {
    throw { response: { status: 404, data: { message: "Not found" } } };
  });

  await assert.rejects(
    rfqApi.list(),
    (error) =>
      error instanceof RfqApiError &&
      error.status === 404 &&
      error.isConflict === false,
  );
});
