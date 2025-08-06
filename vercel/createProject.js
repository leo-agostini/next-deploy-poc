import { Vercel } from "@vercel/sdk";
import minimist from "minimist";


async function createAndGetProject() {
  const { token, repo, project, name } = minimist(process.argv.slice(2));
  const vercel = new Vercel({
    bearerToken: token,
  });

  const envs = fs.readFileSync(`envs/${project}/${name}.json`, "utf8");
  const envsJson = JSON.parse(envs);

  try {
    const createResponse = await vercel.projects.createProject({
      requestBody: {
        name: `${name}-${project}`,
        framework: "nextjs",
        enablePreviewFeedback: true,
        outputDirectory: "out",
        gitRepository: {
          type: "github",
          repo,
        },
        environmentVariables: Object.entries(envsJson).map(([key, value]) => ({
          key,
          value,
          type: "plain",
          target: "production",
        })),
      },
    });

    console.log(`Project created: ${createResponse.id}`);
    console.log("Project Details:", JSON.stringify(createResponse, null, 2));
  } catch (error) {
    console.error(
      error instanceof Error ? `Error: ${error.message}` : String(error)
    );
  }
}

createAndGetProject();
