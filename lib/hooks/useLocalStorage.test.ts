import {
  DEFAULT_SERVER,
  LS_KEY,
  RETIRED_DEFAULT_SERVER,
  migrateRetiredServer,
} from "./useLocalStorage";

const list = () => JSON.parse(localStorage.getItem(LS_KEY.SERVER_LIST)!);

describe("migrateRetiredServer (#805)", () => {
  beforeEach(() => localStorage.clear());

  it("points at the Railway relay by default", () => {
    expect(DEFAULT_SERVER).toBe(
      "https://unbrewed-relay-production.up.railway.app",
    );
  });

  it("clears an active server pinned to the old fly default", () => {
    localStorage.setItem(LS_KEY.SERVER_ACTIVE, RETIRED_DEFAULT_SERVER);
    migrateRetiredServer(localStorage);
    expect(localStorage.getItem(LS_KEY.SERVER_ACTIVE)).toBeNull();
  });

  it("treats a trailing-slash fly URL as the old default too", () => {
    localStorage.setItem(LS_KEY.SERVER_ACTIVE, `${RETIRED_DEFAULT_SERVER}/`);
    migrateRetiredServer(localStorage);
    expect(localStorage.getItem(LS_KEY.SERVER_ACTIVE)).toBeNull();
  });

  it("swaps fly for the new default in the server list, keeping customs", () => {
    localStorage.setItem(
      LS_KEY.SERVER_LIST,
      JSON.stringify([RETIRED_DEFAULT_SERVER, "https://my.relay.test"]),
    );
    migrateRetiredServer(localStorage);
    expect(list()).toEqual([DEFAULT_SERVER, "https://my.relay.test"]);
  });

  it("does not duplicate the new default when it is already listed", () => {
    localStorage.setItem(
      LS_KEY.SERVER_LIST,
      JSON.stringify([RETIRED_DEFAULT_SERVER, DEFAULT_SERVER]),
    );
    migrateRetiredServer(localStorage);
    expect(list()).toEqual([DEFAULT_SERVER]);
  });

  it("leaves a genuinely custom server untouched", () => {
    localStorage.setItem(LS_KEY.SERVER_ACTIVE, "https://my.relay.test");
    localStorage.setItem(
      LS_KEY.SERVER_LIST,
      JSON.stringify(["https://my.relay.test"]),
    );
    migrateRetiredServer(localStorage);
    expect(localStorage.getItem(LS_KEY.SERVER_ACTIVE)).toBe(
      "https://my.relay.test",
    );
    expect(list()).toEqual(["https://my.relay.test"]);
  });

  it("tolerates missing or corrupt storage", () => {
    migrateRetiredServer(localStorage);
    localStorage.setItem(LS_KEY.SERVER_LIST, "not json");
    expect(() => migrateRetiredServer(localStorage)).not.toThrow();
    expect(localStorage.getItem(LS_KEY.SERVER_LIST)).toBe("not json");
  });
});
