// This is currently broken and not yet fixex because I haven't decided to make use of it in general.
export default function({types: t}) {
    var requestStatement = null;
    return {
        visitor: {
            Program(path, data) {
                // Reset when the plugin runs on a new file
                requestStatement = null;

                // Require the registry class once
                // Get the filename of the file we are currently transpiling
                const filename = data.file.opts.filename;

                // Don't require the registry in any core module
                if (filename.match(/src\/core\//)) return;

                // Create a require statement for the registry
                const requireDeclaration = t.VariableDeclaration("var", [
                    t.VariableDeclarator(
                        t.Identifier("Registry"),
                        t.MemberExpression(
                            t.MemberExpression(
                                t.CallExpression(t.Identifier("require"), [
                                    t.StringLiteral("LM"),
                                ]),
                                t.Identifier("default")
                            ),
                            t.Identifier("Registry")
                        )
                    ),
                ]);

                // Set _blockHoist which will assure it is appended to the top of the document
                requireDeclaration._blockHoist = 3;

                // Add the requireDeclaration to the document
                const firstNode = path.get("body")[0];
                if (firstNode) firstNode.insertBefore(requireDeclaration);
            },
            CallExpression(path) {
                const node = path.node;

                // Check if the call is to a require method
                const name = node.callee.name;
                if (name !== "require") return;

                // Check if argument is a string literal
                const arg = node.arguments[0];
                if (arg.type !== "StringLiteral") return;

                // Check if string has the LM prefix
                const text = arg.value;
                if (!text.match(/^LM\:/)) return;

                // Remove LM: from string
                arg.value = text.substring(3);

                // Replace normal require
                if (requestStatement) {
                    // As a Registry.request already exists in this file, make it a multi request and add this to it

                    const varNode = requestStatement.node;
                    const declaration = varNode.declarations[0];
                    const requestArgs = declaration.init.arguments;

                    // Turn the assignment into a multipe variable assignment if it isn't already
                    if (declaration.id.type != "ObjectPattern") {
                        declaration.id = t.ObjectPattern([
                            t.ObjectProperty(
                                t.Identifier(requestArgs[0].value),
                                declaration.id
                            ),
                        ]);
                    }

                    // Add the new data to the assignment
                    let varName = path.parentPath.node.id;
                    if (varName) {
                        varName = varName.name;

                        // Add field to descturing object
                        declaration.id.properties.push(
                            t.ObjectProperty(
                                t.Identifier(arg.value),
                                t.Identifier(varName)
                            )
                        );

                        // Add method to request call
                        requestArgs.push(arg);

                        // Remove the original import request
                        path.parentPath.remove();
                    }
                } else {
                    // Replace require with Registry.request
                    path.replaceWith(
                        t.CallExpression(
                            t.MemberExpression(
                                t.Identifier("Registry"),
                                t.Identifier("requestModule")
                            ),
                            [arg]
                        )
                    );

                    // Make it so any future requests add to this already existing request
                    requestStatement = path.parentPath.parentPath;
                }
            },
        },
    };
}
