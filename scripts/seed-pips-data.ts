import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { NodeEntity, Edge, CampaignTransaction, LegislativeStatusLog } from '../src/types';

if (!getApps().length) {
  initializeApp({
    projectId: 'demo-project',
  });
}

const db = getFirestore();
const BATCH_SIZE = 500;

async function seedData() {
  console.log('🌱 Starting PIP-S Data Seeding Pipeline...');
  
  const batch = db.batch();
  let opCount = 0;

  const commitBatch = async () => {
    if (opCount > 0) {
      await batch.commit();
      console.log(`✅ Committed ${opCount} operations.`);
      opCount = 0;
    }
  };

  const addOp = async () => {
    opCount++;
    if (opCount >= BATCH_SIZE) {
      await commitBatch();
    }
  };

  // 1. Entities
  const entities: NodeEntity[] = [
    {
      id: 'bill-ca-ab12',
      name: 'GenAI Consumer Safety Framework',
      entityType: 'BILL',
      jurisdictionState: 'CA',
      createdAt: new Date().toISOString(),
      telemetry: {
        survivalProbability: 0.82,
        specialInterestSyndicationScore: 0.65,
        topicTitleInversionGap: 0.12,
        extraterritorialSpilloverCoefficient: 0.95 // High spillover for CA tech regulation
      }
    },
    {
      id: 'bill-tx-sb402',
      name: 'Homestead Tax Exemption Caps',
      entityType: 'BILL',
      jurisdictionState: 'TX',
      createdAt: new Date().toISOString(),
      telemetry: {
        survivalProbability: 0.45,
        specialInterestSyndicationScore: 0.15,
        topicTitleInversionGap: 0.88, // High rhetorical camouflage
        fundingConcentrationHhi: 0.8
      }
    },
    {
      id: 'pol-ca-smith',
      name: 'Senator Jane Smith',
      entityType: 'POLITICIAN',
      jurisdictionState: 'CA',
      districtCode: 'SD-11',
      createdAt: new Date().toISOString(),
      telemetry: {
        legislativeEffectivenessScore: 4.2,
        outOfDistrictExtractionIndex: 0.75
      }
    },
    {
      id: 'corp-tech-giant',
      name: 'Tech Giant Coalition',
      entityType: 'CORPORATION',
      jurisdictionState: 'US', // National lobby
      createdAt: new Date().toISOString(),
    }
  ];

  for (const entity of entities) {
    const ref = db.collection('entities').doc(entity.id);
    batch.set(ref, entity);
    await addOp();
  }

  // 2. Status Logs (Subcollection)
  const statusLogs: LegislativeStatusLog[] = [
    {
      id: 'status-ca-1',
      billNodeId: 'bill-ca-ab12',
      standardizedStatus: 'INTRODUCED',
      rawStateStatus: 'Read first time',
      changedAt: new Date(Date.now() - 86400000 * 5).toISOString()
    },
    {
      id: 'status-ca-2',
      billNodeId: 'bill-ca-ab12',
      standardizedStatus: 'IN_COMMITTEE',
      rawStateStatus: 'Referred to Com. on P. & C.P.',
      assignedCommittee: 'Privacy and Consumer Protection',
      changedAt: new Date(Date.now() - 86400000 * 2).toISOString()
    }
  ];

  for (const log of statusLogs) {
    const ref = db.collection('entities').doc(log.billNodeId).collection('status_logs').doc(log.id);
    batch.set(ref, log);
    await addOp();
  }

  // 3. Edges (Graph Topology)
  const edges: Edge[] = [
    {
      id: 'edge-1',
      sourceId: 'bill-tx-sb402',
      targetId: 'corp-tech-giant',
      edgeType: 'TARGETS_POPULATION',
      weight: 0.8
    },
    {
      id: 'edge-2',
      sourceId: 'pol-ca-smith',
      targetId: 'bill-ca-ab12',
      edgeType: 'AMENDED_BY',
      weight: 1.0
    }
  ];

  for (const edge of edges) {
    const ref = db.collection('edges').doc(edge.id);
    batch.set(ref, edge);
    await addOp();
  }

  // 4. Transactions
  const transactions: CampaignTransaction[] = [
    {
      id: 'tx-1',
      donorNodeId: 'corp-tech-giant',
      recipientNodeId: 'pol-ca-smith',
      amount: 50000,
      transactionDate: new Date(Date.now() - 86400000 * 30).toISOString(),
      isOutOfDistrict: true,
      donorZipCode: '94043'
    }
  ];

  for (const tx of transactions) {
    const ref = db.collection('transactions').doc(tx.id);
    batch.set(ref, tx);
    await addOp();
  }

  await commitBatch();
  console.log('🎉 PIP-S Seeding complete!');
}

seedData().catch(console.error);
