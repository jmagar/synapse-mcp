import { createServiceContainer } from './src/services/index.js';
import { handleScoutAction } from './src/tools/handlers/scout.js';

async function testScoutConnection() {
  const container = createServiceContainer();
  
  try {
    console.error("=== Starting Scout Test ===");
    const result = await handleScoutAction(
      { 
        action: 'ps',
        host: 'squirts'
      },
      container
    );
    console.error("=== Scout Test Success ===");
    console.log(result);
  } catch (error) {
    console.error("=== Scout Test Failed ===");
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await container.sshPool.closeAll();
  }
}

testScoutConnection();
