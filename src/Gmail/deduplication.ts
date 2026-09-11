import type {
	EffectiveDuplicateRef,
	TriageExecutionDirective,
} from '../types/Gmail/triage';

/**
 * Groups directives that represent duplicates into clusters, choosing the most
 * recent email as the primary directive and populating its `effectiveDuplicates`
 * with references to the subordinate items.
 */
export function groupDirectivesByDuplicates(
	directives: TriageExecutionDirective[]
): TriageExecutionDirective[] {
	if (directives.length <= 1) {
		return directives;
	}

	const directiveById = new Map<string, TriageExecutionDirective>();
	for (const d of directives) {
		directiveById.set(d.email.id, d);
	}

	// Adjacency list for connected components
	const adj = new Map<string, Set<string>>();
	for (const d of directives) {
		adj.set(d.email.id, new Set<string>());
	}

	for (const d of directives) {
		const targetId = d.classification.duplicateOfId?.trim();
		if (targetId && targetId !== d.email.id && directiveById.has(targetId)) {
			adj.get(d.email.id)!.add(targetId);
			adj.get(targetId)!.add(d.email.id);
		}
	}

	const visited = new Set<string>();
	const result: TriageExecutionDirective[] = [];

	for (const d of directives) {
		const id = d.email.id;
		if (visited.has(id)) {
			continue;
		}

		// Traverse connected component (cluster)
		const clusterIds: string[] = [];
		const queue: string[] = [id];
		visited.add(id);

		while (queue.length > 0) {
			const curr = queue.shift()!;
			clusterIds.push(curr);
			for (const neighbor of adj.get(curr)!) {
				if (!visited.has(neighbor)) {
					visited.add(neighbor);
					queue.push(neighbor);
				}
			}
		}

		const clusterDirectives = clusterIds.map((cid) => directiveById.get(cid)!);

		if (clusterDirectives.length === 1) {
			result.push(clusterDirectives[0]);
			continue;
		}

		// Sort by recency: newest date first, or smaller ageInDays
		clusterDirectives.sort((a, b) => {
			const dateA = a.email.date ? a.email.date.getTime() : 0;
			const dateB = b.email.date ? b.email.date.getTime() : 0;
			if (dateA !== dateB) {
				return dateB - dateA;
			}
			return a.email.ageInDays - b.email.ageInDays;
		});

		const primary = clusterDirectives[0];
		const duplicates = clusterDirectives.slice(1);

		const effectiveDuplicates: EffectiveDuplicateRef[] = duplicates.map((dup) => ({
			threadId: dup.threadId,
			subject: dup.email.subject,
		}));

		const hasActionRequired = clusterDirectives.some(
			(item) => item.classification.actionRequired
		);

		result.push({
			...primary,
			classification: {
				...primary.classification,
				actionRequired: hasActionRequired,
			},
			effectiveDuplicates,
		});
	}

	return result;
}
