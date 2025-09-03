import fs from "fs";
import minimist from "minimist";

const { environment, app } = minimist(process.argv.slice(2));

const stringEnvs = fs.readFileSync(`envs/${environment}/${app}.json`, "utf8");
const envsJson = JSON.parse(stringEnvs);
const root_dir = process.cwd()

console.log(root_dir)
console.log(envsJson.envs);


fs.writeFileSync(`.env`, Object.entries(envsJson.envs).map(([key, value]) => `${key}=${value}`).join("\n"));