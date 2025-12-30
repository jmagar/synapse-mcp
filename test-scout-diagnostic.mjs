import { createDefaultContainer } from './dist/services/container.js';
import { handleScoutTool } from './dist/tools/scout.js';

async function testScoutConnection() {
  const container = createDefaultContainer();
  
  try {
    console.error("=== Starting Scout Test ===\n");
    const result = await handleScoutTool(
      { 
        action: 'ps',
        host: 'squirts'
      },
      container
    );
    console.error("\n=== Scout Test Success ===");
    console.log(result);
  } catch (error) {
    console.error("\n=== Scout Test Failed ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    process.exit(1);
  } finally {
    await container.sshPool.closeAll();
  }
}

testScoutConnection();
