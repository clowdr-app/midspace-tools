import arg from "arg";
import assert from "assert";
import chalk from "chalk";
import { readFileSync, writeFileSync } from "fs";
import { assertType } from "typescript-is";

const args = arg({
    "--earlier": String,
    "--later": String,
    "--out-gql": String,
    "--out-variables": String,
});

assert(args["--earlier"], "Must specify earlier version");
assert(args["--later"], "Must specify later version");

type Element = { id: string; createdAt: string; updatedAt: string; data: any[] };

type Data = {
    data: {
        content_Element: Element[];
    };
};

const earlier = readFileSync(args["--earlier"], "utf-8");
const earlierJson = JSON.parse(earlier);

const later = readFileSync(args["--later"], "utf-8");
const laterJson = JSON.parse(later);

const earlierElements = assertType<Data>(earlierJson).data.content_Element;
const laterElements = assertType<Data>(laterJson).data.content_Element;

console.log(chalk`Earlier elements: {green ${earlierElements.length}}`);
console.log(chalk`Later elements: {green ${laterElements.length}}`);

const laterElementsMissingCorrespondingEarlier = laterElements.filter(
    (e) => !earlierElements.some((f) => f.id === e.id)
).length;

console.log(
    chalk`Later elements that have no corresponding earlier element: {${
        laterElementsMissingCorrespondingEarlier === 0 ? "green" : "red"
    } ${laterElementsMissingCorrespondingEarlier}}`
);

if (laterElementsMissingCorrespondingEarlier > 0) {
    throw Error();
}

function createMutation(earlier: Element, later: Element, idx: number): { mutation: string; variable: any } {
    assert(earlier.id === later.id, `Element IDs do not match: ${earlier.id}, ${later.id}`);
    return {
        mutation: `mut${idx}: update_content_Element_by_pk(_set: {data: $var${idx}}, pk_columns: {id: "${earlier.id}"}) {
    id
}`,
        variable: earlier.data,
    };
}

function createMutations(earlierElements: Element[], laterElements: Element[]): { mutation: string; variables: any } {
    const { variables, mutations } = laterElements
        .map((element, idx) => {
            const earlierElement = earlierElements.find((e) => e.id === element.id);
            assert(earlierElement, `Could not find corresponding earlier element: ${element.id}`);
            const { mutation, variable } = createMutation(earlierElement, element, idx);
            return {
                variable: {
                    [`var${idx}`]: variable,
                },
                mutation,
            };
        })
        .reduce(
            (prev, current) => ({
                variables: { ...prev.variables, ...current.variable },
                mutations: `${prev.mutations}\n${current.mutation}`,
            }),
            { variables: {}, mutations: "" }
        );

    const parameters = Object.entries(variables)
        .map(([name]) => `$${name}: jsonb!`)
        .reduce((prev, cur) => `${prev}, ${cur}`);

    return { variables, mutation: `mutation ElementUpdateMutation(${parameters}) {\n${mutations}\n}` };
}

const { mutation, variables } = createMutations(earlierElements, laterElements);

if (args["--out-gql"]) {
    writeFileSync(args["--out-gql"], mutation, { encoding: "utf-8" });
}

if (args["--out-variables"]) {
    writeFileSync(args["--out-variables"], JSON.stringify(variables, null, 2), { encoding: "utf-8" });
}
