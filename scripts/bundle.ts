import { Glob, file, write, CryptoHasher } from "bun";
import JSZip from "jszip";

interface Modlist {
  name: string;
  filename: string;
  url: string;
}

interface ManifestFile {
  downloads: string[];
  env: {
    client?: string;
    server?: string;
  };
  fileSize: number;
  hashes: {
    sha1: string;
    sha512: string;
  };
  path: string;
  url?: string;
  name?: string;
}

interface Manifest {
  dependencies: {
    minecraft: string;
    forge?: string;
    neoforge?: string;
    fabric?: string;
    quilt?: string;
  };
  files: ManifestFile[];
  formatVersion: number;
  game: string;
  name: string;
  summary: string;
  versionId: string;
  sha1?: string;
  id?: string;
}

const workdir = "./modpacks/";

const glob = new Glob("*.mrpack");
const zipNames = await Array.fromAsync(glob.scan(workdir));

for (const zipName of zipNames) {
  const buffer = await file(workdir + zipName).arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  const manifest = await zip.file("modrinth.index.json")!.async("string");
  const manifestJson: Manifest = JSON.parse(manifest);

  const icon = await zip.file("overrides/icon.png")?.async("uint8array");

  const instanceName = zipName.split(".mrpack")[0]!;
  const modList: Modlist[] = await file(
    workdir + instanceName + ".json",
  ).json();
  const modListMap = Object.fromEntries(
    modList.map((mod) => [
      mod.filename.toLowerCase(),
      { url: mod.url, name: mod.name },
    ]),
  );

  manifestJson.id = instanceName;
  const hasher = new CryptoHasher("sha1");
  hasher.update(buffer);
  manifestJson.sha1 = hasher.digest("hex");

  manifestJson.files.forEach((file, i) => {
    const name = (file.path.split("/").pop() || file.path).toLowerCase();

    if (modListMap[name]) {
      manifestJson.files[i]!.url = modListMap[name].url;
      manifestJson.files[i]!.name = modListMap[name].name;
    }
  });

  const indexFile = file(workdir + "index.json");
  const index = (await indexFile.exists()) ? await indexFile.json() : {};

  if (!index[instanceName]) {
    index[instanceName] = {
      version: manifestJson.dependencies.minecraft,
      name: manifestJson.name,
      created: Number(new Date()),
      world: {
        main: 15000,
        other: 10000,
      },
      description: {
        en: "description",
        ru: "описание",
      },
    };
  }

  await indexFile.write(JSON.stringify(index));
  await write(
    workdir + instanceName + "/index.json",
    JSON.stringify(manifestJson),
  );
  await write(workdir + instanceName + "/icon.png", icon || new Uint8Array());
  await write(workdir + instanceName + "/instance.mrpack", buffer);

  await file(workdir + zipName).delete();
  await file(workdir + instanceName + ".json").delete();
}
