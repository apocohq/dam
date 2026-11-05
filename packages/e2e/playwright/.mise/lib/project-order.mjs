import assert from "node:assert/strict";

// TEST_OVERVIEW: full scenarios share the smoke suite's user, agents and controller. They start after smoke setup completes, run one file at a time, and cannot overlap another full project that changes that shared state.
process.env.E2E_FULL = "1";
process.env.E2E_SCOPE = "";
const { default: config } = await import("../../playwright.config.ts");
const projects = config.projects ?? [];
const byName = new Map(
  projects.map((project) => {
    assert.ok(project.name, "every project has a name");
    return [project.name, project];
  }),
);
const full = [...byName.keys()].filter((name) => name.endsWith("-full"));
const smoke = [...byName.keys()].filter(
  (name) =>
    !name.endsWith("-full") &&
    name !== "agent-machine" &&
    name !== "runner-release",
);
assert.ok(full.length > 0, "the full suite must contain full projects");

function ancestors(name) {
  const found = new Set();
  const pending = [...(byName.get(name)?.dependencies ?? [])];
  while (pending.length) {
    const next = pending.pop();
    assert.ok(
      byName.has(next),
      `${name} depends on an unknown project ${next}`,
    );
    if (found.has(next)) continue;
    found.add(next);
    pending.push(...(byName.get(next)?.dependencies ?? []));
  }
  return found;
}

for (const name of full) {
  const before = ancestors(name);
  assert.ok(!before.has(name), `${name} depends on itself`);
  for (const setup of smoke) {
    assert.ok(before.has(setup), `${name} may run before ${setup} finishes`);
  }
  assert.equal(
    byName.get(name)?.workers,
    1,
    `${name} shares fixtures across its files`,
  );
  for (const other of full) {
    if (other === name) continue;
    assert.ok(
      before.has(other) || ancestors(other).has(name),
      `${name} may overlap ${other}`,
    );
  }
}
console.log(
  "Full projects wait for smoke and run without overlapping shared fixtures.",
);
