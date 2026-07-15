import { druidFormTokenBadge } from "./druidForm";

describe("druidFormTokenBadge", () => {
  it.each([
    ["Human", { DRUID_FORM_HUMAN: true }, "✦"],
    ["Bear", { DRUID_FORM_BEAR: true }, "🐾"],
    ["Moonkin", { DRUID_FORM_MOONKIN: true }, "☾"],
  ])("maps Malfurion %s form flags to token badges", (form, flags, icon) => {
    expect(druidFormTokenBadge("malfurion-stormrage", flags)).toMatchObject({
      label: form,
      title: `${form} Form`,
      icon,
    });
  });

  it("defaults Malfurion to Human Form when form flags are absent", () => {
    expect(druidFormTokenBadge("malfurion-stormrage", {})).toMatchObject({ label: "Human" });
  });

  it("does not badge other heroes", () => {
    expect(druidFormTokenBadge("achilles", { DRUID_FORM_BEAR: true })).toBeNull();
  });
});
