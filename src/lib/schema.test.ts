import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import editPlanExample from "../../examples/edit-plan.v1.example.json";
import runnerOpenApi from "../../public/openapi/runner.v1.openapi.json";
import editPlanSchema from "../../public/schemas/edit-plan.v1.schema.json";
import projectSchema from "../../public/schemas/project.v1.schema.json";
import extensionManifest from "../../extension/manifest.json";
import { createEmptyProject } from "./model";

describe("published schemas", () => {
  it("accepts the published edit-plan example", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
    const validate = ajv.compile(editPlanSchema);
    expect(validate(editPlanExample), JSON.stringify(validate.errors)).toBe(true);
  });

  it("accepts a normalized project with V2, reframing, and transcript fields", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
    const validate = ajv.compile(projectSchema);
    expect(validate(createEmptyProject()), JSON.stringify(validate.errors)).toBe(true);
  });

  it("publishes only customer-facing runner routes with bearer authentication", () => {
    const serialized = JSON.stringify(runnerOpenApi);
    const paths = Object.keys(runnerOpenApi.paths);
    expect(paths).toContain("/v1/jobs");
    expect(paths.some((path) => path.includes("enroll"))).toBe(false);
    expect(serialized).not.toContain("secret_ref");
    expect(runnerOpenApi.components.securitySchemes.HTTPBearer.scheme).toBe("bearer");
  });

  it("keeps the MV3 extension shell permission-light", () => {
    expect(extensionManifest.manifest_version).toBe(3);
    expect(extensionManifest.permissions).toEqual(["storage"]);
    expect(extensionManifest).not.toHaveProperty("host_permissions");
    expect(extensionManifest).not.toHaveProperty("content_scripts");
  });
});
