import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, documentId } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Edge, NodeEntity } from '../types';

export interface GraphData {
  nodes: any[];
  links: any[];
}

export function useGraphTopology(rootNodeId: string | null, depth: 2 | 3) {
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!rootNodeId) return;

    let isMounted = true;

    async function fetchTopology() {
      setLoading(true);
      try {
        // BFS the neighborhood level by level, querying only the edges touching
        // the current frontier (chunked by 10 for Firestore's 'in' limit) rather
        // than downloading the entire edges collection.
        const visitedNodes = new Set<string>();
        const visitedEdges = new Map<string, Edge>();

        let currentLevelNodes = new Set<string>([rootNodeId]);
        visitedNodes.add(rootNodeId);

        for (let currentDepth = 0; currentDepth < depth && currentLevelNodes.size > 0; currentDepth++) {
          const frontier = Array.from(currentLevelNodes);
          const nextLevelNodes = new Set<string>();

          const chunkResults = await Promise.all(
            Array.from({ length: Math.ceil(frontier.length / 10) }, (_, i) => frontier.slice(i * 10, i * 10 + 10)).flatMap((chunk) => [
              getDocs(query(collection(db, 'edges'), where('sourceId', 'in', chunk))),
              getDocs(query(collection(db, 'edges'), where('targetId', 'in', chunk))),
            ]),
          );

          for (const snap of chunkResults) {
            snap.forEach((d) => {
              const edge = { id: d.id, ...d.data() } as Edge;
              visitedEdges.set(edge.id, edge);
              if (!visitedNodes.has(edge.sourceId)) {
                visitedNodes.add(edge.sourceId);
                nextLevelNodes.add(edge.sourceId);
              }
              if (!visitedNodes.has(edge.targetId)) {
                visitedNodes.add(edge.targetId);
                nextLevelNodes.add(edge.targetId);
              }
            });
          }

          currentLevelNodes = nextLevelNodes;
        }

        const nodeIdsToFetch = Array.from(visitedNodes);
        if (nodeIdsToFetch.length === 0) {
          if (isMounted) {
            setData({ nodes: [], links: [] });
            setLoading(false);
          }
          return;
        }

        // Fetch NodeEntities in chunks of 10
        const nodes: NodeEntity[] = [];
        for (let i = 0; i < nodeIdsToFetch.length; i += 10) {
          const chunk = nodeIdsToFetch.slice(i, i + 10);
          const q = query(collection(db, 'entities'), where(documentId(), 'in', chunk));
          const snap = await getDocs(q);
          snap.forEach(d => nodes.push({ id: d.id, ...d.data() } as NodeEntity));
        }

        // Format for react-force-graph
        const formattedNodes = nodes.map(n => ({
          id: n.id,
          name: n.name,
          val: n.entityType === 'BILL' ? 20 : 10,
          color: getNodeColor(n.entityType),
          type: n.entityType
        }));

        const formattedLinks = Array.from(visitedEdges.values()).map(e => ({
          source: e.sourceId,
          target: e.targetId,
          label: e.edgeType
        }));

        if (isMounted) {
          setData({ nodes: formattedNodes, links: formattedLinks });
          setLoading(false);
        }

      } catch (e) {
        console.error("Error fetching topology:", e);
        if (isMounted) setLoading(false);
      }
    }

    fetchTopology();

    return () => {
      isMounted = false;
    };
  }, [rootNodeId, depth]);

  return { data, loading };
}

function getNodeColor(type: string) {
  switch (type) {
    case 'BILL': return '#3b82f6'; // Blue
    case 'POLITICIAN': return '#ef4444'; // Red
    case 'CORPORATION': return '#8b5cf6'; // Purple
    case 'PAC': return '#10b981'; // Green
    default: return '#9ca3af'; // Gray
  }
}
