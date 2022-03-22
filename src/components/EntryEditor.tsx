import React, { useState, useEffect } from "react";
import { PlainClientAPI } from "contentful-management";
import { EditorExtensionSDK } from "@contentful/app-sdk";
// Forma 36 Components
import { Field, FieldWrapper } from "@contentful/default-field-editors";
import { FormControl, Select } from "@contentful/f36-components";
//Data
import conditionalFieldData from "../conditionalFields.json";

/* ===========Types and Iterfaces =========== */
// Prop types for Editor component
interface EditorProps {
  sdk: EditorExtensionSDK;
  cma: PlainClientAPI;
}

// Prop types for DefaultField component
interface DefaultFieldProps {
  fieldId: string;
  sdk: any;
  widgetId: string | null;
}

// Conditional field data types
interface IConditions {
  eq: Array<string | boolean>;
}

interface IConditonalField {
  fieldId: string;
  conditions: IConditions[];
}

// A field whose value will be managed in this app's state
type ManagedFieldValue = string | boolean | null;

interface ManagedFieldValueState {
  [field: string]: ManagedFieldValue;
}

interface CustomSelectProps {
  value: ManagedFieldValue;
  fieldId: string;
  options: string[];
  handleChange: (fieldId: string, input: string) => void;
  sdk: any;
}

/* =========== Data ===========*/
const CONDITIONAL_FIELDS = conditionalFieldData as IConditonalField[];

/* =========== Helper functions =========== */

// Converts a field into <FieldAPI> data type, which is the expected data type for many API methods
const getFieldAPI = (fieldId: string, sdk: EditorExtensionSDK) =>
  sdk.entry.fields[fieldId].getForLocale(sdk.locales.default);

// Creates a <FieldExtensionSDK> type that can be passed to components from the default-field-editors package
const getFieldExtensionSdk = (fieldId: string, sdk: EditorExtensionSDK) =>
  Object.assign({ field: getFieldAPI(fieldId, sdk) }, sdk);

// Check if a field is meant to be displayed conditionally
const isFieldConditional = (
  fieldId: string,
  data: IConditonalField[]
): boolean => {
  const conditionalField = data.find((field) => field.fieldId === fieldId);
  return conditionalField ? true : false;
};

// Check if a field should be managed (because it conditions the display of another field)
const isFieldManaged = (fieldId: string, data: IConditonalField[]): boolean => {
  const parentCondition = data.find(
    (field) => field.conditions.find((condition) => condition.eq[0] === fieldId) // TODO: eventually fix this to accomodate for possibility of multiple objects in the "conditions" array!
  );
  return parentCondition ? true : false;
};

/* =========== Components =========== */

// Render default contentful fields using Forma 36 Component
const DefaultField = (props: DefaultFieldProps) => {
  const { fieldId, sdk, widgetId } = props;
  return (
    <FieldWrapper sdk={sdk} name={fieldId} showFocusBar={true}>
      <Field sdk={sdk} widgetId={widgetId!} />
    </FieldWrapper>
  );
};

// A stateful Select component that mimics Contentful's default
const CustomSelect = (props: CustomSelectProps) => {
  const { fieldId, options, handleChange, sdk, value } = props;
  return (
    <FieldWrapper sdk={sdk} name={`Conditional Field Example: ${fieldId}`}>
      <FormControl isRequired>
        <Select
          id="optionSelect-controlled"
          name="optionSelect-controlled"
          onChange={(e) => handleChange(fieldId, e.target.value)}
          defaultValue={""}
        >
          <Select.Option value="" isDisabled>
            Please select an option...
          </Select.Option>
          {options.map((option) => (
            <Select.Option
              key={`custom-select-option-${option}`}
              value={option}
            >
              {option}
            </Select.Option>
          ))}
        </Select>
      </FormControl>
    </FieldWrapper>
  );
};

// Our Entry Editor app
const Entry = (props: EditorProps) => {
  const { sdk } = props;

  // Store all the fields that are initially displayed in the Post Editor app
  // These fields are not conditioned by another field
  const [editorFields, setEditorFields] = useState(
    sdk.contentType.fields.filter(
      (field) => !isFieldConditional(field.id, CONDITIONAL_FIELDS)
    )
  );

  // Store the Contentful field data for fields whose state will be managed by this app (for this app, that means any field which condition the display of other fields)
  const managedFields = sdk.contentType.fields.filter((field) =>
    isFieldManaged(field.id, CONDITIONAL_FIELDS)
  );

  // Store the input values of managed fields.
  // Managed fields are fields whose state needs to be managed by this app.
  const [managedFieldValues, setManagedFieldValues] = useState(
    managedFields
      .map((field) => field.id)
      .reduce((acc: ManagedFieldValueState, field) => {
        const defaultValueObject = editorFields.find(
          (editorField) => editorField.id === field
        )?.defaultValue;
        const defaultValue = defaultValueObject
          ? defaultValueObject[sdk.locales.default]
          : "";
        return { ...acc, [field]: defaultValue };
      }, {})
  );

  // save input to Contentful
  const saveInput = (fieldId: string, input: ManagedFieldValue) => {
    getFieldAPI(fieldId, sdk)
      .setValue(input)
      .then((data) => {
        console.log(`saving data to contentful... ${fieldId}:  ${data}`);
      })
      .catch((err) => {
        console.log("something went wrong with saving data to contentful.");
        console.log(err);
      });
  };

  // Update state value for a managed field
  const updateInput = (fieldId: string, input: ManagedFieldValue) => {
    console.log(fieldId, input);
    setManagedFieldValues((prevState) => ({
      ...prevState,
      [fieldId]: input,
    }));

    // Save data to contentful after 3 seconds
    setTimeout(() => {
      saveInput(fieldId, input);
    }, 3000);
  };

  // Watch if the values of any managed fields change
  useEffect(() => {
    // Check if any conditional fields should be displayed
    // The return value of 'fieldsToDisplay' is an array of fieldId strings that should be included in the EditorUI display
    const fieldsToDisplay = CONDITIONAL_FIELDS.filter((field) => {
      const { conditions } = field;

      return conditions.every((condition) => {
        // Check if this condition matches ALL key/val pairs in managedFieldValues
        // You'll need to change this logic if you have OR conditions
        const conditionalField = condition.eq[0] as string;
        return managedFieldValues[conditionalField] === condition.eq[1];
      });
    }).reduce((acc: string[], field) => {
      const { fieldId } = field;
      return [...acc, fieldId];
    }, []);

    // Grab our base fields
    const baseFieldList = sdk.contentType.fields.filter(
      (field) => !isFieldConditional(field.id, CONDITIONAL_FIELDS)
    );
    // Given our list of fieldsToDisplay, grab the contentful field data for those fields from the sdk prop
    const fieldsToDisplayData = sdk.contentType.fields.filter((field) =>
      fieldsToDisplay.includes(field.id)
    );
    // Set the sort order to the sort order of the content model in contentful
    const sortOrder: string[] = sdk.contentType.fields.reduce(
      (acc: string[], field) => {
        return [...acc, field.id];
      },
      []
    );

    // Create and sort our updated list of editor fields
    // Sort order should match the sortOrder array
    const updatedEditorFields = Array.from(
      new Set(baseFieldList.concat(fieldsToDisplayData))
    ).sort((a, b) => sortOrder.indexOf(a.id) - sortOrder.indexOf(b.id));

    // Update editorFields with new fields to display
    setEditorFields(updatedEditorFields);
  }, [managedFieldValues, sdk.contentType.fields]);

  return (
    <>
      {editorFields.map((field) => {
        const control = sdk.editor.editorInterface.controls!.find(
          (control) => control.fieldId === field.id
        );
        const widgetId = control?.widgetId || null;
        const defaultValue = field.defaultValue?.hasOwnProperty(
          sdk.locales.default
        )
          ? field.defaultValue[sdk.locales.default]
          : null;

        // If a field is meant to condiiton another field, render a stateful component.
        // In this app, the postVariant field will condition the display of other fields, so we'll have to manage its state ourselves
        if (field.id === "postVariant") {
          const dropdownOpts =
            field.validations?.find((validation) =>
              validation.hasOwnProperty("in")
            )?.in || null;

          return (
            <CustomSelect
              key={field.id}
              value={
                (managedFieldValues[field.id] as ManagedFieldValue) ||
                defaultValue
              }
              fieldId={field.id}
              options={dropdownOpts as string[]}
              handleChange={updateInput}
              sdk={getFieldExtensionSdk(field.id, sdk)}
            />
          );
        }

        return (
          <DefaultField
            key={field.id}
            fieldId={field.id}
            sdk={getFieldExtensionSdk(field.id, sdk)}
            widgetId={widgetId}
          />
        );
      })}
    </>
  );
};

export default Entry;
