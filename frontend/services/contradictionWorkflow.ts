import { z } from "zod";
import { Agent, AgentInputItem, Runner, withTrace } from "@openai/agents";

// ============================================================================
// Schemas
// ============================================================================

// Schema for triaging the contradiction request
const ContradictionTriageSchema = z.object({
  classification: z.enum(["analyze_all", "analyze_specific_claim", "insufficient_documents"])
});

// Schema for detailed conflicts and contradictions
const ConflictSchema = z.object({
  topic: z.string(),
  documentAStatement: z.string(),
  documentBStatement: z.string(),
  severity: z.enum(["high", "medium", "low"]),
  explanation: z.string()
});

const ConflictListSchema = z.object({
  conflicts: z.array(ConflictSchema)
});

// Schema for points of consensus and document reliability metrics
const ConsensusAndReliabilitySchema = z.object({
  consensusPoints: z.array(z.string()),
  reliabilityMatrix: z.array(
    z.object({
      documentName: z.string(),
      consistencyScore: z.number().min(0).max(100),
      reasoning: z.string()
    })
  )
});

// ============================================================================
// Agents
// ============================================================================

const triageContradictionRequest = new Agent({
  name: "Triage Contradiction Request",
  instructions: `Classify the user's contradiction detection request.
  
  - If two or more documents are provided and the user wants a general contradiction analysis of the documents, respond with "analyze_all".
  - If two or more documents are provided and the user asks a specific question or wants to check a specific claim/hypothesis for contradictions, respond with "analyze_specific_claim".
  - If only one document, or no documents have been provided, respond with "insufficient_documents".`,
  model: "gpt-4.1",
  outputType: ContradictionTriageSchema,
  modelSettings: {
    temperature: 1,
    topP: 1,
    maxTokens: 2048,
    store: true
  }
});

const conflictExtractor = new Agent({
  name: "Conflict Extractor",
  instructions: `Analyze the provided documents to find any direct conflicts, inconsistencies, and contradictions.
  For each conflict, extract:
  - The topic or claim
  - Statement from Document A (including exact reference if possible)
  - Statement from Document B (including exact reference if possible)
  - The severity (high: directly opposing facts, medium: minor numerical discrepancies or timelines, low: differing phrasing or style)
  - Detailed explanation of the contradiction and why they clash.`,
  model: "gpt-5",
  outputType: ConflictListSchema,
  modelSettings: {
    reasoning: {
      effort: "minimal",
      summary: "auto"
    },
    store: true
  }
});

const consensusEvaluator = new Agent({
  name: "Consensus Evaluator",
  instructions: `Explain your consensus reasoning. Identify key points of agreement (consensus) across all documents where the information aligns perfectly.
  Additionally, build a reliability matrix mapping each document to a consistency score (0 to 100) based on how factual, reliable, and consistent it is relative to other documents.`,
  model: "gpt-5-mini",
  outputType: ConsensusAndReliabilitySchema,
  modelSettings: {
    reasoning: {
      effort: "low",
      summary: "auto"
    },
    store: true
  }
});

const specificClaimChecker = new Agent({
  name: "Specific Claim Checker",
  instructions: `Analyze the documents specifically to address the user's query or claim. Determine if the documents contradict each other on this specific claim, support each other, or if one of the documents is silent. Compile a final verdict.`,
  model: "gpt-5",
  modelSettings: {
    reasoning: {
      effort: "low",
      summary: "auto"
    },
    store: true
  }
});

const retryAgent = new Agent({
  name: "Retry Agent",
  instructions: "The user has not uploaded the required minimum of two documents to compare. Suggest that they upload at least two documents using the upload panel or paperclip icon in order to perform contradiction detection.",
  model: "gpt-5-nano",
  modelSettings: {
    reasoning: {
      effort: "minimal",
      summary: "auto"
    },
    store: true
  }
});

// ============================================================================
// Workflow Implementation
// ============================================================================

type WorkflowInput = {
  input_as_text: string;
};

export const runContradictionWorkflow = async (workflow: WorkflowInput) => {
  return await withTrace("Contradiction check workflow", async () => {
    const conversationHistory: AgentInputItem[] = [
      { role: "user", content: [{ type: "input_text", text: workflow.input_as_text }] }
    ];

    const runner = new Runner({
      traceMetadata: {
        __trace_source__: "contradiction-detector-builder"
      }
    });

    // 1. Triage the request
    const triageResultTemp = await runner.run(
      triageContradictionRequest,
      [...conversationHistory]
    );
    conversationHistory.push(...triageResultTemp.newItems.map((item) => item.rawItem));

    if (!triageResultTemp.finalOutput) {
      throw new Error("Triage agent result is undefined");
    }

    const triageResult = triageResultTemp.finalOutput;

    // 2. Branching based on triage classification
    if (triageResult.classification === "analyze_all") {
      // Step A: Extract all conflicts
      const conflictExtractorResultTemp = await runner.run(
        conflictExtractor,
        [...conversationHistory]
      );
      conversationHistory.push(...conflictExtractorResultTemp.newItems.map((item) => item.rawItem));

      if (!conflictExtractorResultTemp.finalOutput) {
        throw new Error("Conflict extractor result is undefined");
      }

      // Step B: Evaluate consensus and reliability
      const consensusResultTemp = await runner.run(
        consensusEvaluator,
        [...conversationHistory]
      );
      conversationHistory.push(...consensusResultTemp.newItems.map((item) => item.rawItem));

      if (!consensusResultTemp.finalOutput) {
        throw new Error("Consensus evaluator result is undefined");
      }

      return {
        classification: "analyze_all",
        conflicts: conflictExtractorResultTemp.finalOutput.conflicts,
        consensusAndReliability: consensusResultTemp.finalOutput
      };

    } else if (triageResult.classification === "analyze_specific_claim") {
      // Step A: Analyze specific claim
      const specificClaimResultTemp = await runner.run(
        specificClaimChecker,
        [...conversationHistory]
      );
      conversationHistory.push(...specificClaimResultTemp.newItems.map((item) => item.rawItem));

      return {
        classification: "analyze_specific_claim",
        explanation: specificClaimResultTemp.finalOutput ?? ""
      };

    } else {
      // Step A: Request more uploads
      const retryResultTemp = await runner.run(
        retryAgent,
        [...conversationHistory]
      );
      conversationHistory.push(...retryResultTemp.newItems.map((item) => item.rawItem));

      return {
        classification: "insufficient_documents",
        explanation: retryResultTemp.finalOutput ?? ""
      };
    }
  });
};
