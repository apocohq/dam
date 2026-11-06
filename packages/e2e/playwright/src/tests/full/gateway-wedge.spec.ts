import { expect, test } from "@playwright/test";

import { waitForAgentIdRunning } from "../../lib/agents.js";
import { createApiClient } from "../../lib/api-client.js";
import { acceptTerms, getAccessToken } from "../../lib/auth.js";
import {
  AGENT_NS,
  agentConditionStatus,
  deleteAgentRow,
  kubectl,
  podField,
  podIsReady,
  scaleController,
  statefulSetField,
} from "../../lib/cluster.js";
import { harnessName } from "../../lib/fixtures.js";

const agentName = "e2e-gateway-wedge";
const credentialVolumePrefix = "cred-";

test("a gateway wedged on a deleted credential Secret heals itself (#2817)", async () => {
  test.setTimeout(900_000);

  const token = await getAccessToken();
  const api = createApiClient(token);
  await acceptTerms(api);

  let agentId = "";
  let wedgedRev = "";
  let connectionId = "";
  let deadSecret = "";
  try {
    await test.step("create an agent with a healthy gateway", async () => {
      const created = await api.agents.create.mutate({
        name: agentName,
        templateId: harnessName,
      });
      agentId = created.id;
      await waitForAgentIdRunning(api, agentId);
    });

    const gw = `${agentId}-gateway`;
    await expect
      .poll(() => podIsReady(`${gw}-0`), {
        timeout: 180_000,
        intervals: [2_000],
        message: "gateway pod never became ready",
      })
      .toBe(true);

    await test.step("grant a credential that the gateway mounts", async () => {
      const before = statefulSetField(
        gw,
        ".spec.template.spec.volumes[*].name",
      ).split(/\s+/);
      const created = await api.connections.create.mutate({
        templateId: "custom-header",
        name: "e2e-gateway-wedge-credential",
        authKind: "header",
        host: "wedge.example.com",
        headerName: "x-e2e-gateway-wedge",
        valueFormat: "{value}",
        value: "e2e-gateway-wedge-fixture",
        envName: "E2E_GATEWAY_WEDGE",
      });
      connectionId = created.id;
      const current = await api.connections.getAgentConnections.query({
        agentId,
      });
      await api.connections.setAgentConnections.mutate({
        agentId,
        connectionIds: [
          ...current.connections.map((connection) => connection.connectionId),
          connectionId,
        ],
      });
      const addedCredentialVolumes = () =>
        statefulSetField(gw, ".spec.template.spec.volumes[*].name")
          .split(/\s+/)
          .filter(
            (name) =>
              name.startsWith(credentialVolumePrefix) && !before.includes(name),
          );
      await expect
        .poll(addedCredentialVolumes, { timeout: 120_000, intervals: [2_000] })
        .toHaveLength(1);
      deadSecret =
        addedCredentialVolumes()[0]?.slice(credentialVolumePrefix.length) ?? "";
      expect(deadSecret).not.toBe("");
      await expect
        .poll(() => podField(`${gw}-0`, ".spec.volumes[*].secret.secretName"), {
          timeout: 180_000,
          intervals: [2_000],
        })
        .toContain(deadSecret);
      await expect
        .poll(() => podIsReady(`${gw}-0`), {
          timeout: 180_000,
          intervals: [2_000],
        })
        .toBe(true);
    });

    await test.step("revoke the credential while the controller is stopped", async () => {
      scaleController(0);
      await api.connections.delete.mutate({ id: connectionId });
      connectionId = "";
      kubectl(
        "-n",
        AGENT_NS,
        "delete",
        "secret",
        deadSecret,
        "--ignore-not-found",
      );
      await expect
        .poll(
          () =>
            kubectl(
              "-n",
              AGENT_NS,
              "get",
              "secret",
              deadSecret,
              "--ignore-not-found",
              "-o",
              "name",
            ),
          { timeout: 60_000, intervals: [2_000] },
        )
        .toBe("");
      kubectl("-n", AGENT_NS, "delete", "pod", `${gw}-0`, "--wait=false");

      await expect
        .poll(() => podField(`${gw}-0`, ".status.phase"), {
          timeout: 180_000,
          intervals: [2_000],
          message: "gateway pod never wedged on the missing Secret",
        })
        .toBe("Pending");
      const wedgedPodUid = podField(`${gw}-0`, ".metadata.uid");
      expect(wedgedPodUid).not.toBe("");
      await expect
        .poll(
          () =>
            kubectl(
              "-n",
              AGENT_NS,
              "get",
              "events",
              "--field-selector",
              `involvedObject.uid=${wedgedPodUid}`,
              "-o",
              "custom-columns=REASON:.reason",
              "--no-headers",
            ),
          {
            timeout: 60_000,
            intervals: [2_000],
            message: "no FailedMount event on the wedged pod",
          },
        )
        .toContain("FailedMount");

      wedgedRev = podField(
        `${gw}-0`,
        ".metadata.labels.controller-revision-hash",
      );
      expect(wedgedRev).not.toBe("");
    });

    await test.step("the controller corrects the desired state", async () => {
      scaleController(1);
      await expect
        .poll(
          () => statefulSetField(gw, ".spec.template.spec.volumes[*].name"),
          {
            timeout: 180_000,
            intervals: [2_000],
            message: "desired template kept the dead Secret reference",
          },
        )
        .not.toContain(deadSecret);
    });

    await test.step("the gateway recovers without operator intervention", async () => {
      await expect
        .poll(() => podIsReady(`${gw}-0`), {
          timeout: 300_000,
          intervals: [3_000],
          message: "wedged gateway never recovered",
        })
        .toBe(true);
      expect(
        podField(`${gw}-0`, ".metadata.labels.controller-revision-hash"),
      ).not.toBe(wedgedRev);
      await expect
        .poll(() => agentConditionStatus(agentId, "Ready"), {
          timeout: 120_000,
          intervals: [2_000],
          message: "agent Ready condition never recovered",
        })
        .toBe("True");
    });
  } finally {
    try {
      scaleController(1);
    } catch {}
    if (connectionId) {
      try {
        await api.connections.delete.mutate({ id: connectionId });
      } catch {}
    }
    if (agentId) {
      try {
        await api.agents.delete.mutate({ id: agentId });
      } catch {
        deleteAgentRow(agentId);
      }
    }
  }
});
