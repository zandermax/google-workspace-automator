import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface ClaspConfig {
	scriptId?: unknown;
}

interface RemoteMetadata {
	pulledAt: string;
	scriptId: string;
	localGitCommit: string | null;
	status: 'success' | 'failed';
	error?: string;
}

type FileSystemError = NodeJS.ErrnoException;

const repoRoot = resolve(process.cwd());
const localConfigPath = resolve(repoRoot, '.clasp.json');
const remoteDirectory = resolve(repoRoot, '.remote');
const remoteConfigPath = resolve(remoteDirectory, '.clasp.json');
const metadataPath = resolve(remoteDirectory, 'metadata.json');

function fail(message: string): never {
	console.error(`Remote pull failed: ${message}`);
	process.exit(1);
}

function readScriptId(): string {
	try {
		const config = JSON.parse(
			readFileSync(localConfigPath, 'utf8')
		) as ClaspConfig;
		if (typeof config.scriptId !== 'string' || config.scriptId.length === 0) {
			return fail(`${localConfigPath} does not contain a scriptId.`);
		}

		return config.scriptId;
	} catch (error) {
		const fileError = error as FileSystemError;
		if (fileError.code === 'ENOENT') {
			return fail(
				`${localConfigPath} is missing. Run "clasp clone <script-id>" or create local clasp linkage first.`
			);
		}

		return fail(`could not read ${localConfigPath}: ${getErrorMessage(error)}`);
	}
}

function getGitCommit(): string | null {
	try {
		return execFileSync('git', ['rev-parse', 'HEAD'], {
			cwd: repoRoot,
			encoding: 'utf8',
		}).trim();
	} catch {
		return null;
	}
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function writeMetadata(metadata: RemoteMetadata): void {
	writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
}

const scriptId = readScriptId();

mkdirSync(remoteDirectory, { recursive: true });
writeFileSync(remoteConfigPath, `${JSON.stringify({ scriptId }, null, 2)}\n`);

try {
	execFileSync('clasp', ['pull'], {
		cwd: remoteDirectory,
		stdio: 'inherit',
	});

	writeMetadata({
		pulledAt: new Date().toISOString(),
		scriptId,
		localGitCommit: getGitCommit(),
		status: 'success',
	});
	console.log(`Remote Apps Script snapshot written to ${remoteDirectory}`);
} catch (error) {
	writeMetadata({
		pulledAt: new Date().toISOString(),
		scriptId,
		localGitCommit: getGitCommit(),
		status: 'failed',
		error: getErrorMessage(error),
	});

	const fileError = error as FileSystemError;
	fail(
		fileError.code === 'ENOENT'
			? 'clasp is not installed or is not on PATH.'
			: getErrorMessage(error)
	);
}