import { Task } from '../src/domain/task/Task';
import { TaskDTO } from '../src/infra/types/task';
import { StandardFlow } from '../src/domain/task/flow/StandardFlow';

async function verifyTaskEntity() {
  console.log("🔍 Starting Task Entity enhanced fields verification...");

  // 1. Create initial task entity
  const task = new Task(
    "task-001",
    "trace-001",
    "session-001",
    "Verify Task Fields",
    "This is a test task to verify if Task entity correctly handles new fields."
  );
  
  task.flow = new StandardFlow();
  
  // Set new fields
  task.successCriteria = "1. DTO contains new fields\n2. Entity restoration does not lose data";
  task.phaseSummary = {
    "PLANNING": "Task decomposition completed",
    "DOING": "Core logic implemented"
  };
  task.context = "This is the assembled context content";

  console.log("✅ Task entity created and new fields set.");

  // 2. Convert to DTO
  const dto = task.toDTO();
  
  console.log("📦 Converted to DTO.");

  // Verify DTO fields
  let errors = 0;
  if (dto.successCriteria !== task.successCriteria) {
    console.error("❌ Error: DTO successCriteria mismatch");
    errors++;
  }
  if (JSON.stringify(dto.phaseSummary) !== JSON.stringify(task.phaseSummary)) {
    console.error("❌ Error: DTO phaseSummary mismatch");
    errors++;
  }
  if (dto.context !== task.context) {
    console.error("❌ Error: DTO context mismatch");
    errors++;
  }

  if (errors === 0) {
    console.log("✅ DTO fields verification successful.");
  } else {
    process.exit(1);
  }

  // 3. Restore from DTO
  const restoredTask = Task.fromDTO(dto);
  
  console.log("🔄 Restored entity from DTO.");

  // Verify restored entity
  if (restoredTask.successCriteria !== task.successCriteria) {
    console.error("❌ Error: Restored successCriteria mismatch");
    errors++;
  }
  if (JSON.stringify(restoredTask.phaseSummary) !== JSON.stringify(task.phaseSummary)) {
    console.error("❌ Error: Restored phaseSummary mismatch");
    errors++;
  }
  if (restoredTask.context !== task.context) {
    console.error("❌ Error: Restored context mismatch");
    errors++;
  }

  if (errors === 0) {
    console.log("🎉 All verifications passed! Task Entity enhancement successful.");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

verifyTaskEntity().catch(err => {
  console.error("❌ 驗證過程中發生錯誤:", err);
  process.exit(1);
});
