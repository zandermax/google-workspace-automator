import type { PluginObj } from '@babel/core';

const stripExports = ({ types: t }: Parameters<PluginObj['manipulateOptions']>[0]) => ({
	name: 'strip-exports',
	visitor: {
		ExportNamedDeclaration(path: any) {
			if (path.node.declaration) {
				path.replaceWith(path.node.declaration);
			} else {
				path.remove();
			}
		},
		ExportDefaultDeclaration(path: any) {
			const { declaration } = path.node;

			if (t.isIdentifier(declaration)) {
				path.remove();
				return;
			}

			if (
				(t.isClassDeclaration(declaration) || t.isFunctionDeclaration(declaration)) &&
				declaration.id
			) {
				path.replaceWith(declaration);
				return;
			}

			throw path.buildCodeFrameError(
				'Apps Script builds require named default class or function exports.'
			);
		},
	},
});

export default stripExports;