/**
 * Installs the Notion stub before anything else loads, so the indexer can
 * be run as a real child process with no token and no network:
 *
 *   node --import=./notion-stub.test.mjs index-archives.mjs --from notion
 *
 * Fixture only. Never imported by the scripts themselves.
 */
import { stubFetch } from './archives-fixture.test.mjs';

stubFetch();
